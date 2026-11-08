export const MAX_NOTE_LENGTH = 50_000;
export const SEEK_TIMEOUT_MS = 15_000;
export type FailureCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED"
  | "STALE_CONTEXT"
  | "PLAYER_UNAVAILABLE"
  | "SEEK_TIMEOUT"
  | "STORAGE_FAILED"
  | "SCHEMA_UNSUPPORTED"
  | "RELEASE_CHECK_FAILED";
export class AppError extends Error {
  constructor(
    public code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function fail(code: FailureCode, message: string): never {
  throw new AppError(code, message);
}
export function asAppError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError(
        "STORAGE_FAILED",
        "Không thể hoàn tất thao tác. Nội dung chưa lưu vẫn được giữ trong ô nhập.",
      );
}
export interface Clock {
  now(): string;
  newId(): string;
}
export const clock: Clock = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};
interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface Notebook extends Entity {
  name: string;
}
export interface VideoEntry {
  videoId: string;
  notebookId: string;
  title: string;
  addedAt: string;
  updatedAt: string;
  revision: number;
}
export interface Note extends Entity {
  videoId: string;
  timestampSeconds: number;
  text: string;
}
export interface Draft {
  id: string;
  writerId: string;
  videoId: string;
  videoRevision: number;
  timestampSeconds: number;
  text: string;
  revision: number;
  updatedAt: string;
  noteId?: string;
  expectedNoteRevision?: number;
}
export interface PlayerBinding {
  windowId: number;
  tabId: number;
  documentId: string;
  documentToken: string;
  generation: number;
  videoId: string;
}
export type PageStatus =
  | "ready"
  | "unsupported"
  | "loading"
  | "ad"
  | "live"
  | "unavailable"
  | "reload-required";
export interface PageInspection {
  status: PageStatus;
  videoId: string | null;
  title: string | null;
  currentTime: number | null;
  duration: number | null;
  seekable: Array<{ start: number; end: number }>;
}
export type PlayerReport = PageInspection & {
  documentToken: string;
  generation: number;
};
export type PlayerSnapshot = PageInspection & { binding: PlayerBinding };
export interface VideoSnapshot {
  video: VideoEntry | null;
  notes: Note[];
  drafts: Draft[];
}
export interface NotebookSnapshot {
  notebook: Notebook;
  videos: VideoEntry[];
  notes: Note[];
}
export interface PanelContext {
  windowId: number;
  tabId: number | null;
  videoId: string | null;
  binding: PlayerBinding | null;
  player: PlayerSnapshot | null;
  status: PageStatus;
  notebooks: Notebook[];
  data: VideoSnapshot;
}
export interface PendingSeek {
  requestId: string;
  targetTabId: number;
  videoId: string;
  timestampSeconds: number;
  expiresAt: string;
  documentId: string | null;
  documentToken: string | null;
  generation: number | null;
}
