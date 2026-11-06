import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { openDatabase } from "../src/storage/database";
import { createRepository, type Repository } from "../src/storage/repository";
import { createPendingSeekStore } from "../src/storage/pending-seeks";
import type { Draft, PendingSeek } from "../src/domain/types";
let db: IDBDatabase;
let repo: Repository;
let draft: Draft;
let book: string;
let counter = 0;
beforeEach(async () => {
  db = await openDatabase(indexedDB, `test-${crypto.randomUUID()}`);
  repo = createRepository(db, {
    now: () => "2026-11-06T00:00:00.000Z",
    newId: () => `id-${++counter}`,
  });
  book = (await repo.createNotebook({ name: "Học React" })).id;
  await repo.assignVideo({
    videoId: "abcdefghijk",
    title: "Bài 1",
    notebookId: book,
  });
  draft = await repo.putDraft({
    draft: {
      id: "draft-1",
      writerId: "writer-1",
      videoId: "abcdefghijk",
      videoRevision: 1,
      timestampSeconds: 80.9,
      text: "Điều mình hiểu",
    },
    expectedRevision: null,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  const name = db.name;
  db.close();
  indexedDB.deleteDatabase(name);
});
describe("durable notes and drafts", () => {
  it("atomically saves captured time and retires only the saved draft; retry does not duplicate", async () => {
    const other = await repo.putDraft({
      draft: {
        ...draft,
        id: "draft-2",
        writerId: "writer-2",
        text: "Writer khác",
      },
      expectedRevision: null,
    });
    const saved = await repo.commitDraft({ draft });
    expect(saved).toMatchObject({
      id: "draft-1",
      timestampSeconds: 80.9,
      text: "Điều mình hiểu",
      revision: 1,
    });
    expect(await repo.commitDraft({ draft })).toEqual(saved);
    expect(await repo.readVideo({ videoId: "abcdefghijk" })).toMatchObject({
      notes: [saved],
      drafts: [other],
    });
  });
  it("rolls back both note and draft changes when the transaction aborts", async () => {
    const realPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const request = realPut.apply(this, args);
      if (this.name === "notes") this.transaction.abort();
      return request;
    });
    await expect(repo.commitDraft({ draft })).rejects.toMatchObject({
      code: "STORAGE_FAILED",
    });
    expect(await repo.readVideo({ videoId: "abcdefghijk" })).toMatchObject({
      notes: [],
      drafts: [draft],
    });
  });
  it("refuses stale snapshots without losing newer input", async () => {
    const newer = await repo.putDraft({
      draft: { ...draft, text: "Chữ mới" },
      expectedRevision: 1,
    });
    await expect(repo.commitDraft({ draft })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await repo.readVideo({ videoId: "abcdefghijk" })).drafts).toEqual([
      newer,
    ]);
  });
  it("does not resurrect a saved draft from delayed updates", async () => {
    await repo.commitDraft({ draft });
    await expect(
      repo.putDraft({ draft, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await repo.readVideo({ videoId: "abcdefghijk" })).drafts).toEqual(
      [],
    );
  });
  it("keeps membership revision through metadata updates, rejects moves racing a draft, supports explicit rebind", async () => {
    expect(
      (
        await repo.updateVideoTitle({
          videoId: draft.videoId,
          title: "Tiêu đề mới",
        })
      ).revision,
    ).toBe(1);
    const target = await repo.createNotebook({ name: "Sổ khác" });
    await repo.moveVideo({
      videoId: draft.videoId,
      notebookId: target.id,
      expectedRevision: 1,
    });
    await expect(repo.commitDraft({ draft })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await repo.readVideo({ videoId: draft.videoId })).drafts).toEqual([
      draft,
    ]);
    const rebound = await repo.rebindDraft({
      id: draft.id,
      writerId: draft.writerId,
      expectedDraftRevision: 1,
      expectedCurrentVideoRevision: 2,
    });
    await repo.commitDraft({ draft: rebound });
    expect((await repo.readNotebook({ notebookId: book })).videos).toEqual([]);
    expect(
      (await repo.readNotebook({ notebookId: target.id })).notes[0].text,
    ).toBe("Điều mình hiểu");
  });
  it("restores a separate writer with original content and rejects updates from the retired copy", async () => {
    const restored = await repo.restoreDraft({
      sourceId: draft.id,
      expectedSourceRevision: 1,
      writerId: "new-writer",
      newDraftId: "restored",
    });
    expect(restored).toMatchObject({
      id: "restored",
      writerId: "new-writer",
      timestampSeconds: 80.9,
      text: "Điều mình hiểu",
    });
    await expect(
      repo.putDraft({ draft, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects concurrent note edits and does not recreate a deleted note", async () => {
    const note = await repo.commitDraft({ draft });
    const editing = await repo.putDraft({
      draft: {
        ...draft,
        id: "edit",
        noteId: note.id,
        expectedNoteRevision: note.revision,
        text: "Sửa",
      },
      expectedRevision: null,
    });
    await repo.deleteNote({ id: note.id, expectedRevision: 1 });
    await expect(repo.commitDraft({ draft: editing })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await repo.readVideo({ videoId: draft.videoId })).drafts).toEqual([
      editing,
    ]);
  });
  it("cannot write through another writer or implicitly move an assigned video", async () => {
    await expect(
      repo.putDraft({
        draft: { ...draft, writerId: "intruder" },
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await repo.createNotebook({ name: "Khác" });
    await expect(
      repo.assignVideo({
        videoId: draft.videoId,
        notebookId: other.id,
        title: "X",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("refuses a newer schema instead of resetting it", async () => {
    const name = `newer-${crypto.randomUUID()}`;
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    newer.close();
    await expect(openDatabase(indexedDB, name)).rejects.toMatchObject({
      code: "SCHEMA_UNSUPPORTED",
    });
    indexedDB.deleteDatabase(name);
  });
  it("rejects mismatched payload on a committed note retry", async () => {
    await repo.commitDraft({ draft });
    await expect(
      repo.commitDraft({ draft: { ...draft, text: "Khác" } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
it("an old seek ACK cannot delete a replacement request", async () => {
  const store = createPendingSeekStore(db);
  const seek: PendingSeek = {
    requestId: "old",
    targetTabId: 2,
    videoId: "abcdefghijk",
    timestampSeconds: 80,
    expiresAt: "2026-11-06T00:00:15.000Z",
    documentId: null,
    documentToken: null,
    generation: null,
  };
  await store.put(seek);
  await store.put({ ...seek, requestId: "new" });
  await store.remove({ tabId: 2, requestId: "old" });
  expect((await store.get({ tabId: 2 }))?.requestId).toBe("new");
});
it("recognizes a committed edit after its reply was lost, including a subsequent notebook move", async () => {
  const note = await repo.commitDraft({ draft });
  const editing = await repo.putDraft({
    draft: {
      ...draft,
      id: "edit-retry",
      noteId: note.id,
      expectedNoteRevision: 1,
      text: "Sửa đã commit",
    },
    expectedRevision: null,
  });
  const saved = await repo.commitDraft({ draft: editing });
  expect(await repo.commitDraft({ draft: editing })).toEqual(saved);
  const target = await repo.createNotebook({ name: "Sổ mới" });
  await repo.moveVideo({
    videoId: draft.videoId,
    notebookId: target.id,
    expectedRevision: 1,
  });
  expect(await repo.commitDraft({ draft: editing })).toEqual(saved);
  expect((await repo.readVideo({ videoId: draft.videoId })).notes).toEqual([
    saved,
  ]);
});
