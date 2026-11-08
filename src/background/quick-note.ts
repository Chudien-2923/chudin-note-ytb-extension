import {
  AppError,
  type PlayerBinding,
  type PlayerSnapshot,
} from "../domain/types";
import { sameBinding } from "../domain/identity";
import { senderVideoId } from "./sender";
import { record, validateReport } from "../shared/protocol";
import type {
  PanelAuthority,
  PanelGrant,
  PanelSessions,
} from "./panel-sessions";

export interface QuickNoteIntent {
  id: string;
  snapshot: PlayerSnapshot;
  expiresAt: number;
}
export interface QuickNoteRequests {
  /** Authorize the top frame, issue/reuse its panel session and retain the quick pause, if any. */
  open(message: unknown, sender: chrome.runtime.MessageSender): PanelGrant;
  peek(authority: PanelAuthority): QuickNoteIntent | null;
  ack(authority: PanelAuthority, id: string): void;
  assertResume(
    authority: PanelAuthority,
    input: { id: string; binding: PlayerBinding },
  ): void;
  forgetTab(tabId: number): void;
}
/** Quick-note state of one top document: the unconsumed intent and the latest resume lease. */
interface TabQuickNotes {
  documentId: string;
  pending: QuickNoteIntent | null;
  lease: { id: string; binding: PlayerBinding } | null;
}
const INTENT_TTL_MS = 60000;
export function createQuickNoteRequests(
  panels: PanelSessions,
): QuickNoteRequests {
  const tabs = new Map<number, TabQuickNotes>();
  const forDocument = (authority: PanelAuthority) => {
    const state = tabs.get(authority.tabId);
    return state?.documentId === authority.hostDocumentId ? state : undefined;
  };
  return {
    open(message, sender) {
      const request = record(message);
      if (
        request.version !== 1 ||
        request.op !== "panel.open" ||
        typeof request.requestId !== "string" ||
        !request.requestId ||
        request.requestId.length > 1000
      )
        throw new AppError("INVALID_INPUT", "Yêu cầu mở ghi chú không hợp lệ.");
      const host = panels.trustedHost(sender);
      let intent: QuickNoteIntent | undefined;
      if (request.quickNote !== undefined) {
        const report = validateReport(request.quickNote);
        if (report.status !== "ready" || report.currentTime === null)
          throw new AppError(
            "PLAYER_UNAVAILABLE",
            "Chờ video chính để ghi chú nhanh.",
          );
        if (report.videoId !== senderVideoId(sender))
          throw new AppError(
            "UNAUTHORIZED",
            "Video ghi chú nhanh không khớp trang.",
          );
        intent = {
          id: request.requestId,
          snapshot: {
            ...report,
            binding: {
              windowId: host.windowId,
              tabId: host.tabId,
              documentId: host.documentId,
              documentToken: report.documentToken,
              generation: report.generation,
              videoId: report.videoId!,
            },
          },
          expiresAt: Date.now() + INTENT_TTL_MS,
        };
      }
      const grant = panels.open(sender);
      let state = tabs.get(host.tabId);
      if (state?.documentId !== host.documentId) {
        state = { documentId: host.documentId, pending: null, lease: null };
        tabs.set(host.tabId, state);
      }
      if (intent) {
        state.pending = intent;
        state.lease = { id: intent.id, binding: intent.snapshot.binding };
      }
      return grant;
    },
    peek(authority) {
      const state = forDocument(authority);
      const intent = state?.pending;
      if (!state || !intent) return null;
      if (intent.expiresAt < Date.now()) {
        state.pending = null;
        return null;
      }
      return intent;
    },
    ack(authority, id) {
      const state = forDocument(authority);
      if (state?.pending?.id === id) state.pending = null;
    },
    assertResume(authority, { id, binding }) {
      const lease = forDocument(authority)?.lease;
      if (
        !id ||
        !lease ||
        lease.id !== id ||
        !sameBinding(lease.binding, binding)
      )
        throw new AppError(
          "STALE_CONTEXT",
          "Phiên ghi nhanh đã đổi hoặc extension vừa khởi động lại. Video vẫn dừng.",
        );
    },
    forgetTab(tabId) {
      tabs.delete(tabId);
    },
  };
}
