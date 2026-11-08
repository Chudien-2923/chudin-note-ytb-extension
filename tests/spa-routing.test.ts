import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createBackgroundHandlers } from "../src/background/handlers";
import { createPanelSessions } from "../src/background/panel-sessions";
import { createQuickNoteRequests } from "../src/background/quick-note";
import { createTabCoordinator } from "../src/background/tabs";
import type { PlayerReport } from "../src/domain/types";
import { clock } from "../src/domain/types";
import { openDatabase } from "../src/storage/database";
import { createPendingSeekStore } from "../src/storage/pending-seeks";
import { createRepository } from "../src/storage/repository";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const origin = `chrome-extension://${extensionId}`;
const home = "https://www.youtube.com/";
const firstWatch = "https://www.youtube.com/watch?v=abcdefghijk";
const secondWatch = "https://www.youtube.com/watch?v=lmnopqrstuv";
let db: IDBDatabase;
beforeEach(async () => {
  db = await openDatabase(new IDBFactory());
});
afterEach(() => db.close());

function setup(sourceUrl: string, currentUrl: string, videoId = "abcdefghijk") {
  const tab = { id: 4, windowId: 7, active: true, url: currentUrl } as chrome.tabs.Tab;
  const host: chrome.runtime.MessageSender = {
    id: extensionId,
    frameId: 0,
    documentId: "same-top-document",
    url: sourceUrl,
    tab,
  };
  const frame: chrome.runtime.MessageSender = {
    id: extensionId,
    frameId: 2,
    documentId: "panel-document",
    url: `${origin}/sidepanel.html`,
    origin,
    tab,
  };
  const report: PlayerReport = {
    documentToken: "same-player-document",
    generation: 2,
    videoId,
    title: "Current lesson",
    status: "ready",
    currentTime: 720,
    duration: 1000,
    seekable: [{ start: 0, end: 1000 }],
  };
  const api = {
    tabs: {
      async query() { return [tab]; },
      async sendMessage(_id: number, message: { requestId: string }) {
        return { version: 1, requestId: message.requestId, ok: true, result: report };
      },
    },
    windows: {},
  } as unknown as Pick<typeof chrome, "tabs" | "windows">;
  const panels = createPanelSessions(extensionId);
  const repository = createRepository(db, clock);
  const handlers = createBackgroundHandlers({
    repository,
    panels,
    quickNotes: createQuickNoteRequests(panels),
    tabs: createTabCoordinator({
      chromeApi: api,
      pendingSeeks: createPendingSeekStore(db),
      extensionId,
    }),
    extensionId,
    notify() {},
  });
  const call = (
    sender: chrome.runtime.MessageSender,
    op: string,
    payload?: unknown,
    fields: Record<string, unknown> = {},
  ) => handlers.handleRequest({
    version: 1, requestId: crypto.randomUUID(), op, payload, ...fields,
  }, sender);
  return { host, frame, report, call, repository };
}

it.each([
  ["home to watch", home, firstWatch, "abcdefghijk"],
  ["watch to another video", firstWatch, secondWatch, "lmnopqrstuv"],
])("connects and captures the current video after %s with an unchanged sender URL", async (_name, source, current, videoId) => {
  const { host, frame, report, call, repository } = setup(source, current, videoId);
  const notebook = await repository.createNotebook({ name: "Course" });
  await repository.assignVideo({ videoId, title: "Current lesson", notebookId: notebook.id });
  expect(await call(host, "player.report", report)).toMatchObject({ ok: true });
  const opened = await call(host, "panel.open");
  expect(opened.ok).toBe(true);
  const { session } = opened.result as { session: string };
  expect(await call(frame, "panel.attach", undefined, { panelSession: session })).toMatchObject({ ok: true });
  expect(await call(frame, "getPanelContext", { windowId: 7 }, { panelSession: session })).toMatchObject({
    ok: true,
    result: {
      status: "ready", videoId,
      binding: { tabId: 4, documentId: "same-top-document", generation: 2, videoId },
      data: { video: { videoId, notebookId: notebook.id } },
    },
  });
  expect(await call(host, "panel.open", undefined, { quickNote: report })).toMatchObject({ ok: true, result: { session } });
  expect(await call(frame, "peekQuickNote", { windowId: 7 }, { panelSession: session })).toMatchObject({
    ok: true,
    result: { snapshot: { videoId, currentTime: 720, binding: { videoId, documentId: "same-top-document" } } },
  });
});

it("refuses a previous video's reports and quick pauses after a same-document navigation", async () => {
  const { host, report, call } = setup(firstWatch, secondWatch, "lmnopqrstuv");
  const stale = { ...report, videoId: "abcdefghijk", generation: 1 };
  expect(await call(host, "player.report", stale)).toMatchObject({ ok: false, error: { code: "STALE_CONTEXT" } });
  expect(await call(host, "panel.open", undefined, { quickNote: stale })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
});

it.each([
  ["home", home],
  ["Shorts", "https://www.youtube.com/shorts/abcdefghijk"],
  ["a foreign site", "https://example.test/watch?v=abcdefghijk"],
  ["a malformed URL", "not a URL"],
])("does not fall back to the old watch URL when the current tab is %s", async (_name, current) => {
  const { host, call } = setup(firstWatch, current);
  expect(await call(host, "panel.open")).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
});

it("does not trust a foreign source just because the tab snapshot is a YouTube watch page", async () => {
  const { host, call } = setup("https://example.test/", firstWatch);
  expect(await call(host, "panel.open")).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
});
