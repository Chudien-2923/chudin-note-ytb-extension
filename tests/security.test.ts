import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { openDatabase } from "../src/storage/database";
import { createRepository, type Repository } from "../src/storage/repository";
import { createBackgroundHandlers } from "../src/background/handlers";
import {
  createPanelSessions,
  type PanelSessions,
} from "../src/background/panel-sessions";
import {
  createQuickNoteRequests,
  type QuickNoteRequests,
} from "../src/background/quick-note";
import type { BackgroundHandlers } from "../src/background/handlers";
import type { TabCoordinator } from "../src/background/tabs";
import type { PlayerReport } from "../src/domain/types";
import type { Reply } from "../src/shared/protocol";

interface BackgroundWorker {
  panels: PanelSessions;
  quickNotes: QuickNoteRequests;
  handlers: BackgroundHandlers;
}

let db: IDBDatabase;
let repo: Repository;
beforeEach(async () => {
  db = await openDatabase(indexedDB, crypto.randomUUID());
  repo = createRepository(db, {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });
});
afterEach(() => {
  const name = db.name;
  db.close();
  indexedDB.deleteDatabase(name);
});
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const origin = `chrome-extension://${extensionId}`;
const watch = "https://www.youtube.com/watch?v=abcdefghijk";
const videoId = "abcdefghijk";
const report: PlayerReport = {
  documentToken: "token",
  generation: 1,
  videoId,
  title: "Lesson",
  status: "ready",
  currentTime: 720,
  duration: 1000,
  seekable: [{ start: 0, end: 1000 }],
};
const binding = {
  windowId: 7,
  tabId: 4,
  documentId: "host-4",
  documentToken: "token",
  generation: 1,
  videoId,
};
function host(
  documentId = "host-4",
  tab: Partial<chrome.tabs.Tab> = {},
  overrides: Partial<chrome.runtime.MessageSender> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 0,
    documentId,
    url: watch,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
    ...overrides,
  };
}
function frame(
  documentId = "frame-4",
  tab: Partial<chrome.tabs.Tab> = {},
  overrides: Partial<chrome.runtime.MessageSender> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 5,
    documentId,
    url: `${origin}/sidepanel.html`,
    origin,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
    ...overrides,
  };
}
const notebookPage: chrome.runtime.MessageSender = {
  id: extensionId,
  frameId: 0,
  documentId: "notebook-1",
  url: `${origin}/notebook.html`,
  origin,
  tab: { id: 9, windowId: 7, active: true } as chrome.tabs.Tab,
};
function setup(activeTabId = 4) {
  const calls: Array<[string, unknown]> = [];
  const tabs = {
    acceptReport(...args: unknown[]) {
      calls.push(["acceptReport", args[0]]);
    },
    async getPlayerContext(input: { windowId: number }) {
      calls.push(["getPlayerContext", input]);
      return {
        windowId: input.windowId,
        tabId: activeTabId,
        videoId: null,
        binding: null,
        player: null,
        status: "unsupported" as const,
      };
    },
    async capturePlayer(input: unknown) {
      calls.push(["capturePlayer", input]);
      return { ...report, binding };
    },
    async resumePlayer(input: unknown) {
      calls.push(["resumePlayer", input]);
    },
    async seekFromPanel(input: unknown) {
      calls.push(["seekFromPanel", input]);
    },
    async seekFromNotebook(input: unknown) {
      calls.push(["seekFromNotebook", input]);
    },
    async openNotebook(input: unknown) {
      calls.push(["openNotebook", input]);
    },
  } as unknown as TabCoordinator;
  const spawn = (): BackgroundWorker => {
    const panels = createPanelSessions(extensionId);
    const quickNotes = createQuickNoteRequests(panels);
    const handlers = createBackgroundHandlers({
      repository: repo,
      tabs,
      extensionId,
      notify() {},
      panels,
      quickNotes,
    });
    return { panels, quickNotes, handlers };
  };
  const worker = spawn();
  let n = 0;
  const call = (
    w: BackgroundWorker,
    sender: chrome.runtime.MessageSender,
    op: string,
    payload?: unknown,
    extra: Record<string, unknown> = {},
  ): Promise<Reply> =>
    w.handlers.handleRequest(
      {
        version: 1,
        requestId: `r${++n}`,
        op,
        ...(payload === undefined ? {} : { payload }),
        ...extra,
      },
      sender,
    );
  /** Trusted content opens, then the extension frame attaches: returns the session. */
  const openAndAttach = async (
    w = worker,
    hostSender = host(),
    frameSender = frame(),
    quickNote?: PlayerReport,
  ) => {
    const opened = await call(
      w,
      hostSender,
      "panel.open",
      undefined,
      quickNote ? { quickNote } : {},
    );
    expect(opened).toMatchObject({ ok: true, op: "panel.open" });
    const grant = opened.result as { windowId: number; session: string };
    const attached = await call(w, frameSender, "panel.attach", undefined, {
      panelSession: grant.session,
    });
    expect(attached).toMatchObject({
      ok: true,
      result: { windowId: grant.windowId },
    });
    return grant;
  };
  return { worker, spawn, call, calls, openAndAttach };
}

it("does not return another active tab's context to a hidden panel frame", async () => {
  const { worker, call, openAndAttach } = setup(5);
  const { session } = await openAndAttach();
  expect(
    await call(
      worker,
      frame(),
      "getPanelContext",
      { windowId: 7 },
      { panelSession: session },
    ),
  ).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
});
const create = { name: "Học" };

it("rejects a YouTube content script attempting notebook mutations", async () => {
  const { worker, call } = setup();
  const reply = await call(worker, host(), "createNotebook", create);
  expect(reply).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  expect(await repo.listNotebooks()).toEqual([]);
});
it.each([
  { id: "foreign", url: `${origin}/sidepanel.html` },
  { id: extensionId, url: `${origin}/evil.html` },
])("rejects an unapproved sender without creating data", async (sender) => {
  const { worker, call } = setup();
  expect(await call(worker, sender, "createNotebook", create)).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
  expect(await repo.listNotebooks()).toEqual([]);
});

describe("authenticated panel frame data operations", () => {
  it("lets the attached frame read and save notes, and rejects malformed payloads", async () => {
    const { worker, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: session,
      }),
    ).toMatchObject({ ok: true, result: { name: "Học", revision: 1 } });
    expect(
      await call(
        worker,
        frame(),
        "listNotebooks",
        {},
        { panelSession: session },
      ),
    ).toMatchObject({ ok: true, result: [{ name: "Học" }] });
    expect(
      await call(
        worker,
        frame(),
        "createNotebook",
        { name: 17 },
        { panelSession: session },
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect((await repo.listNotebooks()).map((n) => n.name)).toEqual(["Học"]);
  });
  it("panel.open reply carries the sender window, not a supplied one, and requires the envelope version", async () => {
    const { worker, call } = setup();
    const opened = await call(worker, host(), "panel.open", undefined, {
      windowId: 999,
    });
    expect(opened).toMatchObject({ ok: true, result: { windowId: 7 } });
    expect(
      await worker.handlers.handleRequest(
        { version: 2, requestId: "v2", op: "panel.open" },
        host(),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });
  it("denies every data operation without a session, with a non-string session, or from a copied token", async () => {
    const { worker, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    for (const extra of [
      {},
      { panelSession: 17 },
      { panelSession: "" },
      { panelSession: null },
    ])
      expect(
        await call(worker, frame(), "createNotebook", create, extra),
      ).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: "x".repeat(40),
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    // A malicious webpage-hosted frame, even with the real token.
    for (const sender of [
      host("host-4", {}, { frameId: 3 }),
      host(),
      frame("evil", {}, { url: watch, origin: "https://www.youtube.com" }),
      frame("forged", {}, { origin: "https://www.youtube.com" }),
    ])
      expect(
        await call(worker, sender, "createNotebook", create, {
          panelSession: session,
        }),
      ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await repo.listNotebooks()).toEqual([]);
  });
  it("denies the top-level web-accessible panel even with a valid token", async () => {
    const { worker, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    const topLevel = frame("top", {}, { frameId: 0 });
    expect(
      await call(worker, topLevel, "createNotebook", create, {
        panelSession: session,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(
      await call(worker, topLevel, "panel.attach", undefined, {
        panelSession: session,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await repo.listNotebooks()).toEqual([]);
  });
  it("denies a token copied to another tab or to an unattached frame of the same tab", async () => {
    const { worker, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    const otherTab = frame("frame-5", { id: 5 });
    const sibling = frame("frame-4b", {}, { frameId: 6 });
    for (const sender of [otherTab, sibling]) {
      expect(
        await call(worker, sender, "createNotebook", create, {
          panelSession: session,
        }),
      ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
      if (sender === otherTab)
        expect(
          await call(worker, sender, "panel.attach", undefined, {
            panelSession: session,
          }),
        ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
    expect(await repo.listNotebooks()).toEqual([]);
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: session,
      }),
    ).toMatchObject({ ok: true });
  });
  it("a restarted worker rejects the old token, never writes, and a fresh authenticated open recovers without replaying the lost write", async () => {
    const { spawn: restart, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    const restarted = restart();
    for (const op of ["panel.attach", "createNotebook"])
      expect(
        await call(
          restarted,
          frame(),
          op,
          op === "createNotebook" ? create : undefined,
          {
            panelSession: session,
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await repo.listNotebooks()).toEqual([]);
    const again = await openAndAttach(restarted);
    expect(again.session).not.toBe(session);
    expect(await repo.listNotebooks()).toEqual([]);
    expect(
      await call(restarted, frame(), "createNotebook", create, {
        panelSession: again.session,
      }),
    ).toMatchObject({ ok: true });
    expect(await repo.listNotebooks()).toHaveLength(1);
  });
  it("a new content document revokes the old frame; the old frame cannot use the new token", async () => {
    const { worker, call, openAndAttach } = setup();
    const old = await openAndAttach();
    const next = await openAndAttach(
      worker,
      host("host-4b"),
      frame("frame-4b"),
    );
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: old.session,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: next.session,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await repo.listNotebooks()).toEqual([]);
  });
  it("a player report from a new top document of the tab expires the old session", async () => {
    const { worker, call, openAndAttach } = setup();
    const { session } = await openAndAttach();
    expect(
      await call(worker, host("host-4"), "player.report", report),
    ).toMatchObject({ ok: true });
    expect(
      await call(worker, frame(), "createNotebook", create, {
        panelSession: session,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await call(
        worker,
        host("host-4-after-navigation"),
        "player.report",
        report,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await call(
        worker,
        frame(),
        "createNotebook",
        { name: "Sau" },
        { panelSession: session },
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect((await repo.listNotebooks()).map((n) => n.name)).toEqual(["Học"]);
  });
  it("only a trusted active top-frame content script can open a panel", async () => {
    const { worker, call } = setup();
    for (const sender of [
      frame(),
      host("host-4", { active: false }),
      host("host-4", {}, { frameId: 2 }),
      host("host-4", {}, { id: "foreign" }),
      notebookPage,
    ])
      expect(await call(worker, sender, "panel.open")).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
  });
});

describe("notebook page", () => {
  it("remains authorized for notebook data operations without a panel session but never reaches panel-only operations", async () => {
    const { worker, call, calls } = setup();
    expect(
      await call(worker, notebookPage, "createNotebook", create),
    ).toMatchObject({
      ok: true,
      result: { name: "Học" },
    });
    expect(
      await call(worker, notebookPage, "seekFromNotebook", {
        windowId: 7,
        videoId,
        timestampSeconds: 3,
      }),
    ).toMatchObject({ ok: true });
    for (const [op, payload] of [
      ["getPanelContext", { windowId: 7 }],
      ["capturePlayer", { binding }],
      ["resumePlayer", { binding, quickRequestId: "q" }],
      ["seekFromPanel", { binding, timestampSeconds: 1 }],
      ["peekQuickNote", { windowId: 7 }],
      ["ackQuickNote", { windowId: 7, id: "q" }],
    ] as const)
      expect(await call(worker, notebookPage, op, payload)).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
    expect(calls.map(([name]) => name)).toEqual(["seekFromNotebook"]);
  });
});

describe("snapshot routing", () => {
  it("routes player context, capture, seek and notebook opening only for the frame's own window, tab and document", async () => {
    const { worker, call, calls, openAndAttach } = setup();
    const { session } = await openAndAttach();
    const as = (op: string, payload: unknown) =>
      call(worker, frame(), op, payload, { panelSession: session });
    expect(await as("getPanelContext", { windowId: 7 })).toMatchObject({
      ok: true,
    });
    expect(await as("capturePlayer", { binding })).toMatchObject({ ok: true });
    expect(
      await as("seekFromPanel", { binding, timestampSeconds: 5 }),
    ).toMatchObject({
      ok: true,
    });
    expect(await as("openNotebook", { windowId: 7 })).toMatchObject({
      ok: true,
    });
    expect(calls.map(([name]) => name)).toEqual([
      "getPlayerContext",
      "capturePlayer",
      "seekFromPanel",
      "openNotebook",
    ]);
    calls.length = 0;
    for (const [op, payload] of [
      ["getPanelContext", { windowId: 8 }],
      ["openNotebook", { windowId: 8 }],
      ["capturePlayer", { binding: { ...binding, tabId: 5 } }],
      ["capturePlayer", { binding: { ...binding, windowId: 8 } }],
      [
        "capturePlayer",
        { binding: { ...binding, documentId: "another-document" } },
      ],
      [
        "seekFromPanel",
        { binding: { ...binding, tabId: 5 }, timestampSeconds: 5 },
      ],
      ["seekFromNotebook", { windowId: 7, videoId, timestampSeconds: 5 }],
    ] as const)
      expect(await as(op, payload)).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
    expect(calls).toEqual([]);
  });
});

describe("quick note routing", () => {
  it("lets only the authorized same-tab frame peek, acknowledge and resume; a newer pause revokes the old resume", async () => {
    const { worker, call, calls, openAndAttach } = setup();
    const { session } = await openAndAttach(worker, host(), frame(), report);
    const as = (
      sender: chrome.runtime.MessageSender,
      op: string,
      payload: unknown,
    ) => call(worker, sender, op, payload, { panelSession: session });
    const peeked = await as(frame(), "peekQuickNote", { windowId: 7 });
    expect(peeked).toMatchObject({
      ok: true,
      result: {
        snapshot: {
          currentTime: 720,
          binding: { tabId: 4, documentId: "host-4" },
        },
      },
    });
    const id = (peeked.result as { id: string }).id;
    expect(await as(frame(), "peekQuickNote", { windowId: 8 })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    for (const sender of [
      frame("frame-5", { id: 5 }),
      frame("frame-4b", {}, { frameId: 6 }),
      notebookPage,
      host(),
    ])
      expect(await as(sender, "peekQuickNote", { windowId: 7 })).toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
    expect(
      await as(frame(), "ackQuickNote", { windowId: 7, id }),
    ).toMatchObject({ ok: true });
    expect(await as(frame(), "peekQuickNote", { windowId: 7 })).toMatchObject({
      ok: true,
      result: null,
    });
    expect(
      await as(frame(), "resumePlayer", { binding, quickRequestId: id }),
    ).toMatchObject({ ok: true });
    expect(calls.filter(([name]) => name === "resumePlayer")).toHaveLength(1);
    // The panel reopens with a newer pause: the old save may no longer resume playback.
    const again = await call(worker, host(), "panel.open", undefined, {
      quickNote: report,
    });
    expect(again).toMatchObject({ ok: true, result: { session } });
    expect(
      await as(frame(), "resumePlayer", { binding, quickRequestId: id }),
    ).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
    expect(calls.filter(([name]) => name === "resumePlayer")).toHaveLength(1);
    const fresh = await as(frame(), "peekQuickNote", { windowId: 7 });
    const freshId = (fresh.result as { id: string }).id;
    expect(freshId).not.toBe(id);
    expect(
      await as(frame(), "resumePlayer", {
        binding: { ...binding, documentId: "other" },
        quickRequestId: freshId,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(
      await as(frame(), "resumePlayer", { binding, quickRequestId: freshId }),
    ).toMatchObject({ ok: true });
  });
});

it("rejects subframe reports and nonfinite player snapshots", async () => {
  const { worker, call } = setup();
  const sender = host("d1", { id: 1, windowId: 1 }, { frameId: 1 });
  const bad = { ...report, currentTime: Infinity, duration: 100 };
  expect(await call(worker, sender, "player.report", bad)).toMatchObject({
    ok: false,
  });
  expect(
    await call(worker, { ...sender, frameId: 0 }, "player.report", bad),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
});
