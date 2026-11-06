import {
  fail,
  type Clock,
  type Draft,
  type Note,
  type Notebook,
  type NotebookSnapshot,
  type VideoEntry,
  type VideoSnapshot,
} from "../domain/types";
import { validPosition, validVideoId } from "../domain/identity";
import {
  compareNotes,
  validateNotebookName,
  validateNoteText,
} from "../domain/library";
import { request, transact } from "./database";
export interface DraftInput {
  draft: Omit<Draft, "revision" | "updatedAt">;
  expectedRevision: number | null;
}
export interface Repository {
  listNotebooks(): Promise<Notebook[]>;
  createNotebook(input: { name: string }): Promise<Notebook>;
  renameNotebook(input: {
    id: string;
    name: string;
    expectedRevision: number;
  }): Promise<Notebook>;
  assignVideo(input: {
    videoId: string;
    title: string;
    notebookId: string;
  }): Promise<VideoEntry>;
  moveVideo(input: {
    videoId: string;
    notebookId: string;
    expectedRevision: number;
  }): Promise<VideoEntry>;
  updateVideoTitle(input: {
    videoId: string;
    title: string;
  }): Promise<VideoEntry>;
  readVideo(input: { videoId: string }): Promise<VideoSnapshot>;
  readNotebook(input: { notebookId: string }): Promise<NotebookSnapshot>;
  putDraft(input: DraftInput): Promise<Draft>;
  restoreDraft(input: {
    sourceId: string;
    expectedSourceRevision: number;
    writerId: string;
    newDraftId: string;
  }): Promise<Draft>;
  rebindDraft(input: {
    id: string;
    writerId: string;
    expectedDraftRevision: number;
    expectedCurrentVideoRevision: number;
  }): Promise<Draft>;
  discardDraft(input: {
    id: string;
    writerId: string;
    expectedRevision: number;
  }): Promise<void>;
  commitDraft(input: { draft: Draft }): Promise<Note>;
  deleteNote(input: { id: string; expectedRevision: number }): Promise<void>;
}
function id(value: string): string {
  if (typeof value !== "string" || !value || value.length > 256)
    fail("INVALID_INPUT", "Định danh không hợp lệ.");
  return value;
}
function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    fail("INVALID_INPUT", "Phiên bản dữ liệu không hợp lệ.");
  return value;
}
function videoId(value: string): string {
  if (!validVideoId(value)) fail("INVALID_INPUT", "Video không hợp lệ.");
  return value;
}
function conflict(): never {
  return fail(
    "CONFLICT",
    "Dữ liệu đã thay đổi ở nơi khác. Nội dung đang viết vẫn được giữ; hãy đọc lại bản mới.",
  );
}
function required<T>(value: T | undefined): T {
  if (!value) fail("NOT_FOUND", "Không tìm thấy dữ liệu.");
  return value;
}
function matchesDraft(a: Draft, b: Draft): boolean {
  return (
    a.id === b.id &&
    a.writerId === b.writerId &&
    a.videoId === b.videoId &&
    a.videoRevision === b.videoRevision &&
    a.revision === b.revision &&
    a.text === b.text &&
    a.timestampSeconds === b.timestampSeconds &&
    a.noteId === b.noteId &&
    a.expectedNoteRevision === b.expectedNoteRevision
  );
}
export function createRepository(db: IDBDatabase, clock: Clock): Repository {
  const read = <T>(
    stores: string[],
    work: (tx: IDBTransaction) => Promise<T>,
  ) => transact(db, stores, "readonly", work);
  const write = <T>(work: (tx: IDBTransaction) => Promise<T>) =>
    transact(db, ["notebooks", "videos", "notes", "drafts"], "readwrite", work);
  const get = <T>(tx: IDBTransaction, store: string, key: string) =>
    request<T | undefined>(tx.objectStore(store).get(id(key)));
  const put = (tx: IDBTransaction, store: string, value: unknown) =>
    request(tx.objectStore(store).put(value));
  const byVideo = <T>(tx: IDBTransaction, store: string, key: string) =>
    request<T[]>(tx.objectStore(store).index("videoId").getAll(videoId(key)));
  const validateDraft = (draft: DraftInput["draft"]) => {
    id(draft.id);
    id(draft.writerId);
    videoId(draft.videoId);
    revision(draft.videoRevision);
    validPosition(draft.timestampSeconds);
    if (typeof draft.text !== "string" || draft.text.length > 50000)
      fail("INVALID_INPUT", "Nháp tối đa 50.000 ký tự.");
    if (draft.noteId !== undefined) {
      id(draft.noteId);
      revision(draft.expectedNoteRevision!);
    } else if (draft.expectedNoteRevision !== undefined)
      fail("INVALID_INPUT", "Nháp sửa không hợp lệ.");
  };
  return {
    listNotebooks: () =>
      read(["notebooks"], async (tx) =>
        (await request<Notebook[]>(tx.objectStore("notebooks").getAll())).sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        ),
      ),
    createNotebook: (input) =>
      write(async (tx) => {
        const name = validateNotebookName(input.name);
        const now = clock.now();
        const item: Notebook = {
          id: clock.newId(),
          name,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        await put(tx, "notebooks", item);
        return item;
      }),
    renameNotebook: (input) =>
      write(async (tx) => {
        const old = required(await get<Notebook>(tx, "notebooks", input.id));
        if (old.revision !== revision(input.expectedRevision)) conflict();
        const next = {
          ...old,
          name: validateNotebookName(input.name),
          revision: old.revision + 1,
          updatedAt: clock.now(),
        };
        await put(tx, "notebooks", next);
        return next;
      }),
    assignVideo: (input) =>
      write(async (tx) => {
        videoId(input.videoId);
        required(await get<Notebook>(tx, "notebooks", input.notebookId));
        const old = await get<VideoEntry>(tx, "videos", input.videoId);
        if (old) {
          if (old.notebookId !== input.notebookId) conflict();
          return old;
        }
        const now = clock.now();
        const next: VideoEntry = {
          videoId: input.videoId,
          notebookId: input.notebookId,
          title: String(input.title || input.videoId).slice(0, 1000),
          addedAt: now,
          updatedAt: now,
          revision: 1,
        };
        await put(tx, "videos", next);
        return next;
      }),
    moveVideo: (input) =>
      write(async (tx) => {
        const old = required(
          await get<VideoEntry>(tx, "videos", videoId(input.videoId)),
        );
        required(await get<Notebook>(tx, "notebooks", input.notebookId));
        if (old.revision !== revision(input.expectedRevision)) conflict();
        if (old.notebookId === input.notebookId) return old;
        const next = {
          ...old,
          notebookId: input.notebookId,
          revision: old.revision + 1,
          addedAt: clock.now(),
          updatedAt: clock.now(),
        };
        await put(tx, "videos", next);
        return next;
      }),
    updateVideoTitle: (input) =>
      write(async (tx) => {
        const old = required(
          await get<VideoEntry>(tx, "videos", videoId(input.videoId)),
        );
        const next = {
          ...old,
          title: String(input.title || input.videoId).slice(0, 1000),
          updatedAt: clock.now(),
        };
        await put(tx, "videos", next);
        return next;
      }),
    readVideo: (input) =>
      read(["videos", "notes", "drafts"], async (tx) => ({
        video:
          (await get<VideoEntry>(tx, "videos", videoId(input.videoId))) ?? null,
        notes: (await byVideo<Note>(tx, "notes", input.videoId)).sort(
          compareNotes,
        ),
        drafts: (await byVideo<Draft>(tx, "drafts", input.videoId)).sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
        ),
      })),
    readNotebook: (input) =>
      read(["notebooks", "videos", "notes"], async (tx) => {
        const notebook = required(
          await get<Notebook>(tx, "notebooks", input.notebookId),
        );
        const videos = await request<VideoEntry[]>(
          tx.objectStore("videos").index("notebookId").getAll(notebook.id),
        );
        const notes: Note[] = [];
        for (const video of videos)
          notes.push(...(await byVideo<Note>(tx, "notes", video.videoId)));
        return { notebook, videos, notes: notes.sort(compareNotes) };
      }),
    putDraft: (input) =>
      write(async (tx) => {
        validateDraft(input.draft);
        const value = input.draft;
        const video = required(
          await get<VideoEntry>(tx, "videos", value.videoId),
        );
        if (video.revision !== value.videoRevision) conflict();
        const old = await get<Draft>(tx, "drafts", value.id);
        if (input.expectedRevision === null) {
          if (old || (await get<Note>(tx, "notes", value.id))) conflict();
        } else if (
          !old ||
          old.revision !== revision(input.expectedRevision) ||
          old.writerId !== value.writerId ||
          old.videoId !== value.videoId ||
          old.timestampSeconds !== value.timestampSeconds ||
          old.noteId !== value.noteId ||
          old.expectedNoteRevision !== value.expectedNoteRevision
        )
          conflict();
        const next: Draft = {
          id: value.id,
          writerId: value.writerId,
          videoId: value.videoId,
          videoRevision: value.videoRevision,
          timestampSeconds: value.timestampSeconds,
          text: value.text,
          revision: (old?.revision ?? 0) + 1,
          updatedAt: clock.now(),
          ...(value.noteId
            ? {
                noteId: value.noteId,
                expectedNoteRevision: value.expectedNoteRevision,
              }
            : {}),
        };
        await put(tx, "drafts", next);
        return next;
      }),
    restoreDraft: (input) =>
      write(async (tx) => {
        const old = required(await get<Draft>(tx, "drafts", input.sourceId));
        if (
          old.revision !== revision(input.expectedSourceRevision) ||
          (await get<Draft>(tx, "drafts", input.newDraftId)) ||
          (await get<Note>(tx, "notes", input.newDraftId))
        )
          conflict();
        id(input.writerId);
        if (input.newDraftId === input.sourceId) conflict();
        const next: Draft = {
          ...old,
          id: id(input.newDraftId),
          writerId: input.writerId,
          revision: 1,
          updatedAt: clock.now(),
        };
        await put(tx, "drafts", next);
        await request(tx.objectStore("drafts").delete(old.id));
        return next;
      }),
    rebindDraft: (input) =>
      write(async (tx) => {
        const old = required(await get<Draft>(tx, "drafts", input.id));
        const video = required(
          await get<VideoEntry>(tx, "videos", old.videoId),
        );
        if (
          old.writerId !== input.writerId ||
          old.revision !== revision(input.expectedDraftRevision) ||
          video.revision !== revision(input.expectedCurrentVideoRevision)
        )
          conflict();
        const next = {
          ...old,
          videoRevision: video.revision,
          revision: old.revision + 1,
          updatedAt: clock.now(),
        };
        await put(tx, "drafts", next);
        return next;
      }),
    discardDraft: (input) =>
      write(async (tx) => {
        const old = await get<Draft>(tx, "drafts", input.id);
        if (
          !old ||
          old.writerId !== input.writerId ||
          old.revision !== revision(input.expectedRevision)
        )
          conflict();
        await request(tx.objectStore("drafts").delete(old.id));
      }),
    commitDraft: (input) =>
      write(async (tx) => {
        const value = input.draft;
        validateDraft(value);
        revision(value.revision);
        validateNoteText(value.text);
        const existing = await get<Note>(tx, "notes", value.noteId ?? value.id);
        const stored = await get<Draft>(tx, "drafts", value.id);
        if (!stored) {
          const committedRevision = value.noteId
            ? value.expectedNoteRevision! + 1
            : 1;
          if (
            existing &&
            existing.videoId === value.videoId &&
            existing.text === value.text &&
            existing.timestampSeconds === value.timestampSeconds &&
            existing.revision === committedRevision
          )
            return existing;
          conflict();
        }
        const video = required(
          await get<VideoEntry>(tx, "videos", value.videoId),
        );
        if (video.revision !== value.videoRevision) conflict();
        if (!matchesDraft(stored, value)) conflict();
        if (
          value.noteId
            ? !existing ||
              existing.revision !== value.expectedNoteRevision ||
              existing.videoId !== value.videoId ||
              existing.timestampSeconds !== value.timestampSeconds
            : existing
        )
          conflict();
        const now = clock.now();
        const note: Note = {
          id: value.noteId ?? value.id,
          videoId: value.videoId,
          timestampSeconds: value.timestampSeconds,
          text: value.text,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          revision: (existing?.revision ?? 0) + 1,
        };
        await put(tx, "notes", note);
        await request(tx.objectStore("drafts").delete(value.id));
        return note;
      }),
    deleteNote: (input) =>
      write(async (tx) => {
        const old = await get<Note>(tx, "notes", input.id);
        if (!old || old.revision !== revision(input.expectedRevision))
          conflict();
        await request(tx.objectStore("notes").delete(old.id));
      }),
  };
}
