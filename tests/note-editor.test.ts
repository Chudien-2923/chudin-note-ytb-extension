import "fake-indexeddb/auto";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase } from "../src/storage/database";
import { createRepository, type Repository } from "../src/storage/repository";
import { createNoteEditor } from "../src/ui/note-editor";
import type { Client } from "../src/ui/client";
import type { CommandMap } from "../src/shared/protocol";
import type { PlayerSnapshot, VideoEntry } from "../src/domain/types";
let db: IDBDatabase;
let repo: Repository;
let dom: JSDOM;
let video: VideoEntry;
const snapshot: PlayerSnapshot = {
  binding: {
    windowId: 1,
    tabId: 1,
    documentId: "d",
    documentToken: "t",
    generation: 1,
    videoId: "abcdefghijk",
  },
  videoId: "abcdefghijk",
  title: "A",
  status: "ready",
  currentTime: 80.9,
  duration: 200,
  seekable: [{ start: 0, end: 200 }],
};
beforeEach(async () => {
  db = await openDatabase(indexedDB, crypto.randomUUID());
  repo = createRepository(db, {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });
  const book = await repo.createNotebook({ name: "Học" });
  video = await repo.assignVideo({
    videoId: "abcdefghijk",
    notebookId: book.id,
    title: "A",
  });
  dom = new JSDOM('<section id="editor"></section>');
  dom.window.focus = () => {};
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
});
afterEach(() => {
  dom.window.close();
  const name = db.name;
  db.close();
  indexedDB.deleteDatabase(name);
});
function client(capture: () => Promise<PlayerSnapshot>): Client {
  return {
    async call<K extends keyof CommandMap>(
      op: K,
      payload: CommandMap[K]["input"],
    ): Promise<CommandMap[K]["output"]> {
      if (op === "capturePlayer")
        return (await capture()) as CommandMap[K]["output"];
      if (op in repo) {
        const method = repo[op as keyof Repository] as (
          input: unknown,
        ) => Promise<unknown>;
        return (await method(payload)) as CommandMap[K]["output"];
      }
      throw Error(`Unexpected operation ${op}`);
    },
    subscribe() {
      return () => {};
    },
  };
}
it("serializes repeated starts before player capture returns so one visible editor owns one draft", async () => {
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  const result = await Promise.allSettled([
    editor.startNew(),
    editor.startNew(),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts,
  ).toHaveLength(1);
  editor.dispose();
});
it("rejects a stale capture when the active video changes before draft creation", async () => {
  let release: ((snapshot: PlayerSnapshot) => void) | undefined;
  const capture = new Promise<PlayerSnapshot>((resolve) => {
    release = resolve;
  });
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(() => capture),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  const starting = editor.startNew();
  const other = await repo.assignVideo({
    videoId: "lmnopqrstuv",
    notebookId: video.notebookId,
    title: "B",
  });
  editor.bind(
    other,
    { ...snapshot.binding, videoId: other.videoId, generation: 2 },
    true,
  );
  release!(snapshot);
  await expect(starting).rejects.toMatchObject({ code: "STALE_CONTEXT" });
  expect((await repo.readVideo({ videoId: video.videoId })).drafts).toEqual([]);
  expect(editor.hasDraft()).toBe(false);
  editor.dispose();
});
async function until(check: () => boolean | Promise<boolean>) {
  // Yield the IndexedDB event loop, not a guessed wall-clock delay.
  for (let turn = 0; turn < 1000; turn++) {
    if (await check()) return;
    await setImmediate();
  }
  throw Error("Editor did not settle");
}
function click(text: string) {
  const target = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  if (!target) throw Error(`Missing action ${text}`);
  target.click();
}
it("retains a committed initialization in its original video slot when navigation changes during the write", async () => {
  let release: (() => void) | undefined;
  let wrote: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const written = new Promise<void>((resolve) => {
    wrote = resolve;
  });
  const base = client(async () => snapshot);
  const delayed: Client = {
    ...base,
    async call(op, payload) {
      const result = await base.call(op, payload);
      if (op === "putDraft") {
        wrote!();
        await gate;
      }
      return result;
    },
  };
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    delayed,
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  const starting = editor.startNew();
  await written;
  const other = await repo.assignVideo({
    videoId: "lmnopqrstuv",
    title: "B",
    notebookId: video.notebookId,
  });
  editor.bind(
    other,
    { ...snapshot.binding, videoId: other.videoId, generation: 2 },
    true,
  );
  release!();
  await expect(starting).resolves.toBeUndefined();
  expect(editor.hasDraft()).toBe(false);
  editor.bind(video, snapshot.binding, true);
  expect(editor.hasDraft()).toBe(true);
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts,
  ).toHaveLength(1);
  editor.dispose();
});
it("starts timestamp capture on first focus without allowing text before capture", async () => {
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  const textarea = document.querySelector("textarea")!;
  expect(textarea.disabled).toBe(false);
  expect(textarea.readOnly).toBe(true);
  textarea.focus();
  await until(() => editor.hasDraft() && !textarea.readOnly);
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts[0]
      .timestampSeconds,
  ).toBe(80.9);
  editor.dispose();
});
it("keeps over-limit pasted text visible and reports the limit without silently truncating", async () => {
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.startNew();
  const textarea = document.querySelector("textarea")!;
  textarea.value = "x".repeat(50001);
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  await until(() => document.querySelector("[role=alert]") !== null);
  expect(textarea.value).toHaveLength(50001);
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts[0].text,
  ).toBe("");
  editor.dispose();
});
it("lets an active draft explicitly rebind after another window moves its video without losing local input", async () => {
  Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
    showModal: {
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value: function (this: HTMLDialogElement, result: string) {
        this.returnValue = result;
        this.dispatchEvent(new window.Event("close"));
      },
    },
  });
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.startNew();
  const textarea = document.querySelector("textarea")!;
  textarea.value = "Nháp giữ lại";
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  await until(
    async () =>
      (await repo.readVideo({ videoId: video.videoId })).drafts[0].text ===
      "Nháp giữ lại",
  );
  const target = await repo.createNotebook({ name: "Sổ mới" });
  const moved = await repo.moveVideo({
    videoId: video.videoId,
    notebookId: target.id,
    expectedRevision: 1,
  });
  editor.bind(moved, snapshot.binding, true);
  textarea.value = "Nháp giữ lại và chữ mới";
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  await until(() => document.querySelector("[role=alert]") !== null);
  click("Cập nhật liên kết nháp");
  await until(() => document.querySelector("dialog") !== null);
  click("Đồng ý");
  await until(async () => {
    const d = (await repo.readVideo({ videoId: video.videoId })).drafts[0];
    return d.videoRevision === 2 && d.text === "Nháp giữ lại và chữ mới";
  });
  click("Lưu ghi chú");
  await until(
    async () =>
      (await repo.readVideo({ videoId: video.videoId })).notes.length === 1,
  );
  expect(
    (await repo.readNotebook({ notebookId: target.id })).notes[0].text,
  ).toBe("Nháp giữ lại và chữ mới");
  editor.dispose();
});
it("can dismiss a retired local draft without deleting the replacement writer draft", async () => {
  Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
    showModal: {
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value: function (this: HTMLDialogElement, result: string) {
        this.returnValue = result;
        this.dispatchEvent(new window.Event("close"));
      },
    },
  });
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.startNew();
  const original = (await repo.readVideo({ videoId: video.videoId })).drafts[0];
  const replacement = await repo.restoreDraft({
    sourceId: original.id,
    expectedSourceRevision: original.revision,
    writerId: "other",
    newDraftId: "replacement",
  });
  click("Hủy nháp");
  await until(() => document.querySelector("dialog") !== null);
  click("Đồng ý");
  await until(() => !editor.hasDraft());
  expect((await repo.readVideo({ videoId: video.videoId })).drafts).toEqual([
    replacement,
  ]);
  editor.dispose();
});
it("quick notes focus the editor at the paused time and Enter resumes only after the note commit", async () => {
  let resumed = false;
  const base = client(async () => snapshot);
  const quickClient: Client = {
    ...base,
    async call(op, payload) {
      if (op === "resumePlayer") {
        expect(
          (await repo.readVideo({ videoId: video.videoId })).notes[0].text,
        ).toBe("Ghi nhanh");
        resumed = true;
        return undefined as CommandMap[typeof op]["output"];
      }
      return base.call(op, payload);
    },
  };
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    quickClient,
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.beginQuickNote({ ...snapshot, currentTime: 42.5 });
  const textarea = document.querySelector("textarea")!;
  expect(document.activeElement).toBe(textarea);
  textarea.value = "Ghi nhanh";
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  const enter = new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  textarea.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  await until(() => resumed);
  expect(
    (await repo.readVideo({ videoId: video.videoId })).notes[0]
      .timestampSeconds,
  ).toBe(22.5);
  expect(
    document.activeElement === document.querySelector(".editor-heading button"),
  ).toBe(true);
  editor.dispose();
});
it("quick mode retains an existing draft, Shift+Enter and IME do not submit, and save failure never resumes", async () => {
  let resumed = false;
  const base = client(async () => snapshot);
  const failing: Client = {
    ...base,
    async call(op, payload) {
      if (op === "resumePlayer") {
        resumed = true;
        return undefined as CommandMap[typeof op]["output"];
      }
      if (op === "commitDraft") throw Error("disk unavailable");
      return base.call(op, payload);
    },
  };
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    failing,
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.startNew();
  const textarea = document.querySelector("textarea")!;
  textarea.value = "Nháp cũ";
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  await until(
    async () =>
      (await repo.readVideo({ videoId: video.videoId })).drafts[0].text ===
      "Nháp cũ",
  );
  await editor.beginQuickNote({ ...snapshot, currentTime: 90 });
  expect(textarea.value).toBe("Nháp cũ");
  expect(
    (await repo.readVideo({ videoId: video.videoId })).drafts,
  ).toHaveLength(1);
  for (const options of [
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
  ]) {
    const event = new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      ...options,
    });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  textarea.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  await until(() => document.querySelector('[role="alert"]') !== null);
  expect(resumed).toBe(false);
  expect(textarea.value).toBe("Nháp cũ");
  expect((await repo.readVideo({ videoId: video.videoId })).notes).toEqual([]);
  editor.dispose();
});
it("does not retain quick Enter semantics when returning to a newer navigation of the same video", async () => {
  const editor = createNoteEditor(
    document.querySelector<HTMLElement>("#editor")!,
    client(async () => snapshot),
    () => {},
  );
  editor.bind(video, snapshot.binding, true);
  await editor.beginQuickNote(snapshot);
  editor.bind(video, { ...snapshot.binding, generation: 2 }, true);
  const textarea = document.querySelector("textarea")!;
  textarea.value = "Vẫn là nháp";
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  const enter = new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  textarea.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  expect((await repo.readVideo({ videoId: video.videoId })).notes).toEqual([]);
  editor.dispose();
});

it.each([
  { paused: 720, expected: 700 },
  { paused: 12, expected: 0 },
])(
  "new quick note at $paused seconds starts at $expected seconds",
  async ({ paused, expected }) => {
    const capture = { ...snapshot, currentTime: paused, duration: 900 };
    const editor = createNoteEditor(
      document.querySelector<HTMLElement>("#editor")!,
      client(async () => capture),
      () => {},
    );
    editor.bind(video, capture.binding, true);
    await editor.beginQuickNote(capture);
    const textarea = document.querySelector("textarea")!;
    textarea.value = "Mốc trước khi bấm";
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    await until(
      async () =>
        (await repo.readVideo({ videoId: video.videoId })).drafts[0]?.text ===
        textarea.value,
    );
    expect(
      (await repo.readVideo({ videoId: video.videoId })).drafts[0]
        .timestampSeconds,
    ).toBe(expected);
    await editor.beginQuickNote({ ...capture, currentTime: paused + 10 });
    expect(textarea.value).toBe("Mốc trước khi bấm");
    expect(
      (await repo.readVideo({ videoId: video.videoId })).drafts[0]
        .timestampSeconds,
    ).toBe(expected);
    editor.dispose();
  },
);
