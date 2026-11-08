import {
  AppError,
  fail,
  type Draft,
  type PanelContext,
  type PlayerBinding,
  type PlayerReport,
  type PlayerSnapshot,
  type FailureCode,
} from "../domain/types";
import { validVideoId } from "../domain/identity";
import type { Repository } from "../storage/repository";
import type { QuickNoteIntent } from "../background/quick-note";
import type { ReleaseCheckResult } from "./releases";
type MethodCommand<F> = F extends (...args: infer A) => Promise<infer O>
  ? { input: A extends [] ? Record<string, never> : A[0]; output: O }
  : never;
export type CommandMap = {
  [K in keyof Repository]: MethodCommand<Repository[K]>;
} & {
  checkRelease: { input: Record<string, never>; output: ReleaseCheckResult };
  getPanelContext: { input: { windowId: number }; output: PanelContext };
  capturePlayer: { input: { binding: PlayerBinding }; output: PlayerSnapshot };
  resumePlayer: {
    input: { binding: PlayerBinding; quickRequestId: string };
    output: void;
  };
  peekQuickNote: {
    input: { windowId: number };
    output: QuickNoteIntent | null;
  };
  ackQuickNote: { input: { windowId: number; id: string }; output: void };
  seekFromPanel: {
    input: { binding: PlayerBinding; timestampSeconds: number };
    output: void;
  };
  seekFromNotebook: {
    input: { windowId: number; videoId: string; timestampSeconds: number };
    output: void;
  };
  openNotebook: {
    input: { windowId: number; notebookId?: string };
    output: void;
  };
};
export type CommandName = keyof CommandMap;
export interface Request {
  version: 1;
  requestId: string;
  op: CommandName;
  payload: unknown;
}
export interface Reply {
  version: 1;
  requestId: string;
  op: string;
  ok: boolean;
  result?: unknown;
  error?: { code: FailureCode; message: string };
}
export interface Invalidation {
  version: 1;
  op: "invalidate";
  videoIds: string[];
  notebookIds: string[];
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("INVALID_INPUT", "Dữ liệu yêu cầu không hợp lệ.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1000;
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
export function validBinding(value: unknown): value is PlayerBinding {
  const b = record(value);
  return (
    integer(b.windowId) &&
    integer(b.tabId) &&
    text(b.documentId) &&
    text(b.documentToken) &&
    integer(b.generation) &&
    validVideoId(b.videoId)
  );
}
export function validateReport(value: unknown): PlayerReport {
  const p = record(value);
  if (
    ![
      "ready",
      "unsupported",
      "loading",
      "ad",
      "live",
      "unavailable",
      "reload-required",
    ].includes(String(p.status)) ||
    !(p.videoId === null || validVideoId(p.videoId)) ||
    !(
      p.title === null ||
      (typeof p.title === "string" && p.title.length <= 1000)
    ) ||
    !text(p.documentToken) ||
    !integer(p.generation) ||
    !Array.isArray(p.seekable) ||
    p.seekable.length > 1000
  )
    fail("INVALID_INPUT", "Snapshot player không hợp lệ.");
  for (const key of ["duration", "currentTime"])
    if (
      p[key] !== null &&
      (typeof p[key] !== "number" ||
        !Number.isFinite(p[key]) ||
        (p[key] as number) < 0)
    )
      fail("INVALID_INPUT", "Thời gian player không hợp lệ.");
  if (
    p.status === "ready" &&
    (!validVideoId(p.videoId) ||
      typeof p.currentTime !== "number" ||
      typeof p.duration !== "number" ||
      p.duration <= 0)
  )
    fail("INVALID_INPUT", "Player chưa sẵn sàng.");
  for (const item of p.seekable) {
    const r = record(item);
    if (
      typeof r.start !== "number" ||
      typeof r.end !== "number" ||
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start < 0 ||
      r.end < r.start
    )
      fail("INVALID_INPUT", "Khoảng video không hợp lệ.");
  }
  return p as unknown as PlayerReport;
}
function validDraft(value: unknown): value is Draft {
  const d = record(value);
  return (
    text(d.id) &&
    text(d.writerId) &&
    validVideoId(d.videoId) &&
    integer(d.videoRevision) &&
    (d.videoRevision as number) > 0 &&
    typeof d.text === "string" &&
    d.text.length <= 50000 &&
    typeof d.timestampSeconds === "number" &&
    Number.isFinite(d.timestampSeconds) &&
    d.timestampSeconds >= 0 &&
    (d.noteId === undefined ||
      (text(d.noteId) &&
        integer(d.expectedNoteRevision) &&
        (d.expectedNoteRevision as number) > 0))
  );
}
const operations: CommandName[] = [
  "listNotebooks",
  "createNotebook",
  "renameNotebook",
  "assignVideo",
  "moveVideo",
  "updateVideoTitle",
  "readVideo",
  "readNotebook",
  "putDraft",
  "restoreDraft",
  "rebindDraft",
  "discardDraft",
  "commitDraft",
  "deleteNote",
  "getPanelContext",
  "capturePlayer",
  "resumePlayer",
  "seekFromPanel",
  "seekFromNotebook",
  "openNotebook",
  "checkRelease",
];
export function validateRequest(value: unknown): Request {
  const r = record(value);
  if (
    r.version !== 1 ||
    !text(r.requestId) ||
    !operations.includes(r.op as CommandName)
  )
    fail("INVALID_INPUT", "Lệnh extension không hợp lệ.");
  const p = record(r.payload);
  let valid = true;
  const requireText = (...keys: string[]) => keys.every((k) => text(p[k]));
  const requireRevision = (key: string) =>
    integer(p[key]) && (p[key] as number) > 0;
  switch (r.op) {
    case "checkRelease":
      valid = Object.keys(p).length === 0;
      break;
    case "createNotebook":
      valid = typeof p.name === "string";
      break;
    case "renameNotebook":
      valid =
        requireText("id") &&
        typeof p.name === "string" &&
        requireRevision("expectedRevision");
      break;
    case "assignVideo":
      valid =
        validVideoId(p.videoId) &&
        requireText("notebookId") &&
        typeof p.title === "string";
      break;
    case "moveVideo":
      valid =
        validVideoId(p.videoId) &&
        requireText("notebookId") &&
        requireRevision("expectedRevision");
      break;
    case "updateVideoTitle":
      valid = validVideoId(p.videoId) && typeof p.title === "string";
      break;
    case "readVideo":
      valid = validVideoId(p.videoId);
      break;
    case "readNotebook":
      valid = requireText("notebookId");
      break;
    case "putDraft":
      valid =
        validDraft(p.draft) &&
        (p.expectedRevision === null || requireRevision("expectedRevision"));
      break;
    case "commitDraft":
      valid =
        validDraft(p.draft) &&
        integer(record(p.draft).revision) &&
        (record(p.draft).revision as number) > 0;
      break;
    case "restoreDraft":
      valid =
        requireText("sourceId", "writerId", "newDraftId") &&
        requireRevision("expectedSourceRevision");
      break;
    case "rebindDraft":
      valid =
        requireText("id", "writerId") &&
        requireRevision("expectedDraftRevision") &&
        requireRevision("expectedCurrentVideoRevision");
      break;
    case "discardDraft":
      valid =
        requireText("id", "writerId") && requireRevision("expectedRevision");
      break;
    case "deleteNote":
      valid = requireText("id") && requireRevision("expectedRevision");
      break;
    case "getPanelContext":
    case "openNotebook":
      valid =
        integer(p.windowId) &&
        (p.notebookId === undefined || text(p.notebookId));
      break;
    case "capturePlayer":
      valid = validBinding(p.binding);
      break;
    case "resumePlayer":
      valid = validBinding(p.binding) && text(p.quickRequestId);
      break;
    case "seekFromPanel":
      valid =
        validBinding(p.binding) &&
        typeof p.timestampSeconds === "number" &&
        Number.isFinite(p.timestampSeconds) &&
        p.timestampSeconds >= 0;
      break;
    case "seekFromNotebook":
      valid =
        integer(p.windowId) &&
        validVideoId(p.videoId) &&
        typeof p.timestampSeconds === "number" &&
        Number.isFinite(p.timestampSeconds) &&
        p.timestampSeconds >= 0;
      break;
  }
  if (!valid)
    throw new AppError("INVALID_INPUT", "Nội dung yêu cầu không hợp lệ.");
  return {
    version: 1,
    requestId: r.requestId as string,
    op: r.op as CommandName,
    payload: p,
  };
}
