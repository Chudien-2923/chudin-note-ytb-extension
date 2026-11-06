import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { openDatabase } from "../src/storage/database";
import {
  createPendingSeekStore,
  type PendingSeekStore,
} from "../src/storage/pending-seeks";
import {
  createTabCoordinator,
  type TabCoordinator,
} from "../src/background/tabs";
import type { PendingSeek, PlayerReport } from "../src/domain/types";
let db: IDBDatabase;
let store: PendingSeekStore;
beforeEach(async () => {
  db = await openDatabase(indexedDB, crypto.randomUUID());
  store = createPendingSeekStore(db);
});
afterEach(() => {
  vi.useRealTimers();
  const name = db.name;
  db.close();
  indexedDB.deleteDatabase(name);
});
interface Tab {
  id: number;
  windowId: number;
  index: number;
  active: boolean;
  url: string;
  pendingUrl?: string;
}
interface TabUpdate {
  id: number;
  url?: string;
  active?: boolean;
}
const report: PlayerReport = {
  videoId: "abcdefghijk",
  documentToken: "token",
  generation: 1,
  status: "ready",
  currentTime: 10,
  duration: 100,
  title: "Bài học",
  seekable: [{ start: 0, end: 100 }],
};
function setup(
  initial: Tab[],
  options: { pendingCreate?: boolean; hangCapture?: boolean; wrongSeekAck?: boolean } = {},
) {
  const tabs: Tab[] = initial.map((t) => ({ ...t }));
  const updates: TabUpdate[] = [];
  const sought: number[] = [];
  let coordinator: TabCoordinator;
  let newTabReads = 0;
  const api = {
    tabs: {
      async query(query: { windowId?: number; active?: boolean }) {
        return tabs.filter(
          (t) =>
            (query.windowId === undefined || t.windowId === query.windowId) &&
            (query.active === undefined || t.active === query.active),
        );
      },
      async get(id: number) {
        const tab = tabs.find((t) => t.id === id);
        if (!tab) throw Error("closed");
        if (id === 100 && tab.pendingUrl && ++newTabReads >= 2) {
          tab.url = tab.pendingUrl;
          delete tab.pendingUrl;
        }
        return { ...tab };
      },
      async create(input: { windowId: number; url: string; active: boolean }) {
        const tab: Tab = {
          ...input,
          id: 100,
          index: tabs.length,
          ...(options.pendingCreate ? { url: "", pendingUrl: input.url } : {}),
        };
        tabs.push(tab);
        return tab;
      },
      async update(id: number, input: { url?: string; active?: boolean }) {
        updates.push({ id, ...input });
        Object.assign(tabs.find((t) => t.id === id)!, input);
        return tabs.find((t) => t.id === id);
      },
      async sendMessage(id: number, raw: unknown) {
        if (options.hangCapture) return await new Promise<never>(() => {});
        const m = raw as {
          requestId: string;
          op: string;
          expected?: { generation: number };
          timestampSeconds?: number;
        };
        const tab = tabs.find((t) => t.id === id)!;
        const current = { ...report };
        coordinator.acceptReport(current, {
          id: "extension",
          frameId: 0,
          documentId: `doc-${id}`,
          url: tab.url,
          tab: tab as chrome.tabs.Tab,
        });
        if (m.expected && m.expected.generation !== current.generation)
          return { requestId: m.requestId, ok: false };
        if (m.op === "player.seek") {
          sought.push(id);
          if (!options.wrongSeekAck) current.currentTime = Math.min(m.timestampSeconds!, current.duration!);
        }
        return {
          version: 1,
          requestId: m.requestId,
          ok: true,
          result: current,
        };
      },
    },
    windows: { async update() {} },
  };
  // This adapter supplies only the Chrome operations the coordinator uses.
  const chromeApi = api as unknown as Pick<typeof chrome, "tabs" | "windows">;
  coordinator = createTabCoordinator({
    chromeApi,
    pendingSeeks: store,
    extensionId: "extension",
  });
  return { coordinator, tabs, updates, sought };
}
it("seeks the active matching video within the requesting window, never another window", async () => {
  const { coordinator, sought } = setup([
    {
      id: 1,
      windowId: 2,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: false,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
    {
      id: 3,
      windowId: 1,
      index: 1,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
  ]);
  await coordinator.seekFromNotebook({
    windowId: 1,
    videoId: "abcdefghijk",
    timestampSeconds: 80,
  });
  expect(sought).toEqual([3]);
  expect(await store.list()).toEqual([]);
});
it("opens a new video tab rather than navigating an unrelated tab", async () => {
  const { coordinator, sought, updates, tabs } = setup([
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=lmnopqrstuv",
    },
  ]);
  await coordinator.seekFromNotebook({
    windowId: 1,
    videoId: "abcdefghijk",
    timestampSeconds: 80,
  });
  expect(sought).toEqual([100]);
  expect(tabs.find((t) => t.id === 2)?.url).toBe(
    "https://www.youtube.com/watch?v=lmnopqrstuv",
  );
  expect(updates.some((u) => u.id === 2 && u.url !== undefined)).toBe(false);
});
it("uses its own window active tab and rejects stale panel generations", async () => {
  const { coordinator, sought } = setup([
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
    { id: 3, windowId: 2, index: 0, active: true, url: "https://example.com" },
  ]);
  expect(
    (await coordinator.getPlayerContext({ windowId: 2 })).videoId,
  ).toBeNull();
  const context = await coordinator.getPlayerContext({ windowId: 1 });
  expect(context.binding?.tabId).toBe(2);
  await expect(
    coordinator.seekFromPanel({
      binding: { ...context.binding!, generation: 0 },
      timestampSeconds: 80,
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTEXT" });
  expect(sought).toEqual([]);
});
it("does not resume expired or unbound seeks after a worker restart", async () => {
  const { coordinator, sought } = setup([
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
  ]);
  const pending: PendingSeek = {
    requestId: "old",
    targetTabId: 2,
    videoId: "abcdefghijk",
    timestampSeconds: 80,
    expiresAt: "2000-01-01T00:00:00.000Z",
    documentId: "d",
    documentToken: "t",
    generation: 1,
  };
  await store.put(pending);
  await coordinator.reconcilePending();
  expect(await store.list()).toEqual([]);
  await store.put({
    ...pending,
    requestId: "unbound",
    documentId: null,
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  });
  await coordinator.reconcilePending();
  expect(await store.list()).toEqual([]);
  expect(sought).toEqual([]);
});
it("focuses an existing notebook tab without navigating away from unsaved editor state", async () => {
  const url = "chrome-extension://extension/notebook.html?notebook=old";
  const { coordinator, updates } = setup([
    { id: 2, windowId: 1, index: 0, active: false, url },
  ]);
  await coordinator.openNotebook({ windowId: 1, notebookId: "new" });
  expect(updates).toEqual([{ id: 2, active: true }]);
});
it("refuses a panel binding whose tab is no longer active", async () => {
  const { coordinator, tabs, sought } = setup([
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
  ]);
  const context = await coordinator.getPlayerContext({ windowId: 1 });
  tabs[0].active = false;
  await expect(
    coordinator.seekFromPanel({
      binding: context.binding!,
      timestampSeconds: 80,
    }),
  ).rejects.toMatchObject({ code: "STALE_CONTEXT" });
  expect(sought).toEqual([]);
});
it("reports a closed target as a player/context problem, not a persistence failure", async () => {
  const { coordinator, tabs } = setup([
    {
      id: 2,
      windowId: 1,
      index: 0,
      active: true,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    },
  ]);
  const context = await coordinator.getPlayerContext({ windowId: 1 });
  tabs.splice(0, 1);
  await expect(
    coordinator.capturePlayer({ binding: context.binding! }),
  ).rejects.toMatchObject({ code: "PLAYER_UNAVAILABLE" });
});
it("waits for a new tab with empty url and a matching pendingUrl instead of rejecting it as another video", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { coordinator, sought } = setup(
    [
      {
        id: 2,
        windowId: 1,
        index: 0,
        active: true,
        url: "https://example.com",
      },
    ],
    { pendingCreate: true },
  );
  let failure: unknown;
  let settled = false;
  const running = coordinator
    .seekFromNotebook({
      windowId: 1,
      videoId: "abcdefghijk",
      timestampSeconds: 80,
    })
    .catch((error) => {
      failure = error;
    })
    .finally(() => {
      settled = true;
    });
  for (let turn = 0; turn < 100 && !settled; turn++) {
    await setImmediate();
    await vi.advanceTimersByTimeAsync(200);
  }
  await running;
  expect(failure).toBeUndefined();
  expect(sought).toEqual([100]);
});
it("times out a frozen content channel instead of leaving a seek request pending indefinitely", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { coordinator } = setup(
    [
      {
        id: 2,
        windowId: 1,
        index: 0,
        active: true,
        url: "https://www.youtube.com/watch?v=abcdefghijk",
      },
    ],
    { hangCapture: true },
  );
  let failure: unknown;
  let settled = false;
  const running = coordinator
    .seekFromNotebook({
      windowId: 1,
      videoId: "abcdefghijk",
      timestampSeconds: 80,
    })
    .catch((error) => {
      failure = error;
    })
    .finally(() => {
      settled = true;
    });
  for (let turn = 0; turn < 100 && !settled; turn++) {
    await setImmediate();
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(settled).toBe(true);
  expect(failure).toMatchObject({ code: "SEEK_TIMEOUT" });
  await running;
  expect(await store.list()).toEqual([]);
});
it("does not report success when a matching-identity ACK has not reached the requested time", async () => {
  const { coordinator } = setup([{ id: 2, windowId: 1, index: 0, active: true, url: "https://www.youtube.com/watch?v=abcdefghijk" }], { wrongSeekAck: true });
  await expect(coordinator.seekFromNotebook({ windowId: 1, videoId: "abcdefghijk", timestampSeconds: 80 })).rejects.toMatchObject({ code: "PLAYER_UNAVAILABLE" });
  expect(await store.list()).toEqual([]);
});
