import "fake-indexeddb/auto";
import { setImmediate } from "node:timers/promises";
import { beforeEach, afterEach, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { openDatabase } from "../src/storage/database";
import { createRepository, type Repository } from "../src/storage/repository";
import {
  createQuickNoteRequests,
  type QuickNoteRequests,
} from "../src/background/quick-note";
import { mountPanel } from "../src/panel/controller";
import type { Client } from "../src/ui/client";
import type { CommandMap, Invalidation } from "../src/shared/protocol";
import type { PlayerSnapshot, VideoEntry } from "../src/domain/types";
import type { Mounted } from "../src/ui/shared";
import {
  createPanelSessions,
  type PanelSessions,
} from "../src/background/panel-sessions";
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const sender: chrome.runtime.MessageSender = {
  id: extensionId,
  frameId: 0,
  documentId: "d",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  tab: { id: 2, windowId: 1, active: true } as chrome.tabs.Tab,
};
const page = {
  id: extensionId,
  url: `chrome-extension://${extensionId}/sidepanel.html`,
  frameId: 3,
  documentId: "frame-doc",
  tab: { id: 2, windowId: 1, active: true } as chrome.tabs.Tab,
};
const snapshot: PlayerSnapshot = {
  binding: {
    windowId: 1,
    tabId: 2,
    documentId: "d",
    documentToken: "token",
    generation: 1,
    videoId: "abcdefghijk",
  },
  videoId: "abcdefghijk",
  title: "Lesson",
  status: "ready",
  currentTime: 83,
  duration: 200,
  seekable: [{ start: 0, end: 200 }],
};
let db: IDBDatabase;
let repo: Repository;
let dom: JSDOM;
let requests: QuickNoteRequests;
let panels: PanelSessions;
let panelSession: string;
let video: VideoEntry;
let mounted: Mounted | undefined;
let invalidate: ((value: Invalidation) => void) | undefined;
beforeEach(async () => {
  db = await openDatabase(indexedDB, crypto.randomUUID());
  repo = createRepository(db, {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });
  const book = await repo.createNotebook({ name: "Học" });
  video = await repo.assignVideo({
    videoId: "abcdefghijk",
    title: "Lesson",
    notebookId: book.id,
  });
  panels = createPanelSessions(extensionId);
  requests = createQuickNoteRequests(panels);
  panelSession = panels.open(sender).session;
  panels.attach(panelSession, page);
  dom = new JSDOM('<main id="app"></main>', { url: page.url });
  dom.window.focus = () => {};
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
});
afterEach(() => {
  mounted?.dispose();
  mounted = undefined;
  invalidate = undefined;
  dom.window.close();
  const name = db.name;
  db.close();
  indexedDB.deleteDatabase(name);
});
async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 2000; i++) {
    if (await check()) return;
    await setImmediate();
  }
  throw Error("Panel did not settle");
}
async function intent(id: string) {
  const { binding, ...report } = snapshot;
  await requests.open(
    {
      version: 1,
      op: "panel.open",
      requestId: id,
      quickNote: {
        ...report,
        documentToken: binding.documentToken,
        generation: binding.generation,
      },
    },
    sender,
  );
  invalidate?.({
    version: 1,
    op: "invalidate",
    videoIds: [video.videoId],
    notebookIds: [],
  });
}
function client(
  capture = async () => snapshot,
  beforeAck = async () => {},
): Client {
  return {
    async call<K extends keyof CommandMap>(
      op: K,
      payload: CommandMap[K]["input"],
    ): Promise<CommandMap[K]["output"]> {
      let result: unknown;
      if (op === "getPanelContext")
        result = {
          windowId: 1,
          tabId: 2,
          videoId: video.videoId,
          binding: snapshot.binding,
          player: snapshot,
          status: "ready",
          notebooks: await repo.listNotebooks(),
          data: await repo.readVideo({ videoId: video.videoId }),
        };
      else if (op === "capturePlayer") result = await capture();
      else if (op === "peekQuickNote")
        result = requests.peek(panels.authorize(panelSession, page));
      else if (op === "ackQuickNote") {
        await beforeAck();
        const input = payload as CommandMap["ackQuickNote"]["input"];
        result = requests.ack(panels.authorize(panelSession, page), input.id);
      } else if (op in repo) {
        const method = repo[op as keyof Repository] as (
          input: unknown,
        ) => Promise<unknown>;
        result = await method(payload);
      } else throw Error(op);
      return result as CommandMap[K]["output"];
    },
    subscribe(fn) {
      invalidate = fn;
      return () => {
        invalidate = undefined;
      };
    },
  };
}
it("processes a replacement quick intent arriving while the first acknowledgement is pending, without another external event", async () => {
  let release: (() => void) | undefined;
  let captured = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await intent("one");
  mounted = mountPanel(
    document.querySelector<HTMLElement>("#app")!,
    client(
      async () => snapshot,
      async () => {
        captured = true;
        await gate;
      },
    ),
    { windowId: 1 },
  );
  await until(() => captured);
  await intent("two");
  for (let i = 0; i < 25; i++) await setImmediate();
  release!();
  await until(
    () => requests.peek(panels.authorize(panelSession, page)) === null,
  );
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts,
  ).toHaveLength(1);
  expect(document.activeElement).toBe(document.querySelector("textarea"));
});
it("does not create or acknowledge a new draft when the user declines rebinding the existing recovered draft", async () => {
  await repo.putDraft({
    draft: {
      id: "old",
      writerId: "old-writer",
      videoId: video.videoId,
      videoRevision: 1,
      timestampSeconds: 10,
      text: "Giữ nguyên nháp",
    },
    expectedRevision: null,
  });
  const book = await repo.createNotebook({ name: "Khác" });
  await repo.moveVideo({
    videoId: video.videoId,
    notebookId: book.id,
    expectedRevision: 1,
  });
  Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
    showModal: {
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value: function (this: HTMLDialogElement, value: string) {
        this.returnValue = value;
        this.dispatchEvent(new dom.window.Event("close"));
      },
    },
  });
  await intent("decline");
  mounted = mountPanel(document.querySelector<HTMLElement>("#app")!, client(), {
    windowId: 1,
  });
  await until(() => document.querySelector("dialog") !== null);
  (document.querySelector("dialog") as HTMLDialogElement).close("cancel");
  for (let i = 0; i < 100; i++) await setImmediate();
  const drafts = (await repo.readVideo({ videoId: video.videoId })).drafts;
  expect(drafts.map((d) => d.id)).toEqual(["old"]);
  expect(requests.peek(panels.authorize(panelSession, page))?.id).toBe(
    "decline",
  );
  expect(document.querySelector("dialog")).toBeNull();
});
