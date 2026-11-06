import { describe, it, expect } from "vitest";
import { createEditorSession } from "../src/domain/editor";
import { AppError, type Draft, type PlayerSnapshot } from "../src/domain/types";
const draft: Draft = {
  id: "draft",
  writerId: "writer",
  videoId: "abcdefghijk",
  videoRevision: 1,
  timestampSeconds: 80.9,
  text: "",
  revision: 1,
  updatedAt: "2026-11-06T00:00:00.000Z",
};
const snapshot: PlayerSnapshot = {
  status: "ready",
  videoId: draft.videoId,
  currentTime: 80.9,
  duration: 100,
  seekable: [{ start: 0, end: 100 }],
  title: "Bài học",
  binding: {
    windowId: 1,
    tabId: 2,
    documentId: "d",
    documentToken: "t",
    generation: 1,
    videoId: draft.videoId,
  },
};
describe("editor durability and stale acknowledgements", () => {
  it("waits for durable text before save and retains captured time/text after a failed save", () => {
    const session = createEditorSession();
    session.start(snapshot, draft);
    session.changeText("Điều mình hiểu");
    expect(session.beginSave()).toBeNull();
    session.settleDraft({
      draftId: draft.id,
      localVersion: 1,
      draft: { ...draft, text: "Điều mình hiểu", revision: 2 },
    });
    expect(session.beginSave()).toMatchObject({
      text: "Điều mình hiểu",
      timestampSeconds: 80.9,
      revision: 2,
    });
    session.settleSave({
      draftId: draft.id,
      draftRevision: 2,
      binding: snapshot.binding,
      error: new AppError("STORAGE_FAILED", "Lỗi"),
    });
    expect(session.snapshot()).toMatchObject({
      saving: false,
      draft: { text: "Điều mình hiểu", timestampSeconds: 80.9 },
    });
  });
  it("does not overwrite newer input when an earlier draft write is acknowledged", () => {
    const session = createEditorSession();
    session.start(snapshot, draft);
    session.changeText("A");
    session.changeText("AB");
    session.settleDraft({
      draftId: draft.id,
      localVersion: 1,
      draft: { ...draft, text: "A", revision: 2 },
    });
    expect(session.snapshot().draft?.text).toBe("AB");
    expect(session.beginSave()).toBeNull();
  });
  it("ignores save results from a previous video", () => {
    const session = createEditorSession();
    session.start(snapshot, { ...draft, text: "A" });
    const intent = session.beginSave()!;
    session.start(
      {
        ...snapshot,
        videoId: "lmnopqrstuv",
        binding: { ...snapshot.binding, videoId: "lmnopqrstuv", generation: 2 },
      },
      { ...draft, id: "other", videoId: "lmnopqrstuv", text: "B" },
    );
    session.settleSave({
      draftId: intent.id,
      draftRevision: intent.revision,
      binding: snapshot.binding,
      note: {
        id: "saved",
        videoId: draft.videoId,
        text: "A",
        timestampSeconds: 80.9,
        createdAt: draft.updatedAt,
        updatedAt: draft.updatedAt,
        revision: 1,
      },
    });
    expect(session.snapshot().draft?.text).toBe("B");
  });
  it("can edit an offline saved note without binding to a player", () => {
    const session = createEditorSession();
    session.startEdit({
      ...draft,
      text: "Sửa",
      noteId: "note",
      expectedNoteRevision: 1,
    });
    expect(session.snapshot().binding).toBeNull();
    expect(session.beginSave()?.noteId).toBe("note");
  });
});
