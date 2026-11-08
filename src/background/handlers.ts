import { AppError, asAppError, type PanelContext } from "../domain/types";
import { senderVideoId } from "./sender";
import type { Repository } from "../storage/repository";
import {
  record,
  type CommandMap,
  validateReport,
  validateRequest,
  type Invalidation,
  type Reply,
} from "../shared/protocol";
import type { TabCoordinator } from "./tabs";
import type { PanelAuthority, PanelSessions } from "./panel-sessions";
import type { QuickNoteRequests } from "./quick-note";
import type { ReleaseCheckResult } from "../shared/releases";
export interface BackgroundHandlers {
  handleRequest(
    request: unknown,
    sender: chrome.runtime.MessageSender,
  ): Promise<Reply>;
}
/** Operations that only an authenticated in-page panel frame may call. */
const PANEL_ONLY_OPS = [
  "getPanelContext",
  "capturePlayer",
  "resumePlayer",
  "seekFromPanel",
  "peekQuickNote",
  "ackQuickNote",
];
function assertOwnWindow(authority: PanelAuthority, windowId: unknown) {
  if (windowId !== authority.windowId)
    throw new AppError(
      "UNAUTHORIZED",
      "Panel chỉ thao tác trong cửa sổ của nó.",
    );
}
/** A panel frame may only act on the window, tab and document that hosts it. */
function assertPanelScope(
  authority: PanelAuthority,
  op: string,
  payload: unknown,
) {
  const input = record(payload);
  if (op === "getPanelContext" || op === "openNotebook")
    assertOwnWindow(authority, input.windowId);
  if (
    op === "capturePlayer" ||
    op === "resumePlayer" ||
    op === "seekFromPanel"
  ) {
    const binding = record(input.binding);
    if (
      binding.tabId !== authority.tabId ||
      binding.windowId !== authority.windowId ||
      binding.documentId !== authority.hostDocumentId
    )
      throw new AppError(
        "UNAUTHORIZED",
        "Panel chỉ thao tác trên video của tab đang chứa nó.",
      );
  }
}
export function createBackgroundHandlers(input: {
  repository: Repository;
  tabs: TabCoordinator;
  extensionId: string;
  notify(change: Invalidation): void;
  panels: PanelSessions;
  quickNotes: QuickNoteRequests;
  checkRelease(): Promise<ReleaseCheckResult>;
}): BackgroundHandlers {
  const {
    repository: repo,
    tabs,
    extensionId,
    notify,
    panels,
    quickNotes,
    checkRelease,
  } = input;
  const reportVersions = new Map<number, string>();
  return {
    async handleRequest(value, sender) {
      let requestId = "";
      let op = "invalid";
      try {
        const raw = record(value);
        requestId = typeof raw.requestId === "string" ? raw.requestId : "";
        op = typeof raw.op === "string" ? raw.op : "invalid";
        if (sender.id !== extensionId)
          throw new AppError("UNAUTHORIZED", "Nguồn yêu cầu không được phép.");
        if (op === "panel.open") {
          const grant = quickNotes.open(raw, sender);
          notify({
            version: 1,
            op: "invalidate",
            videoIds: [],
            notebookIds: [],
          });
          return { version: 1, requestId, op, ok: true, result: grant };
        }
        const url = new URL(sender.url ?? "about:blank");
        if (op === "player.report") {
          if (
            raw.version !== 1 ||
            sender.frameId !== 0 ||
            !sender.documentId ||
            sender.tab?.id === undefined ||
            sender.tab.windowId === undefined ||
            url.origin !== "https://www.youtube.com"
          )
            throw new AppError("UNAUTHORIZED", "Nguồn player không được phép.");
          panels.observeTopDocument(sender);
          const report = validateReport(raw.payload);
          if (report.videoId !== senderVideoId(sender))
            throw new AppError("STALE_CONTEXT", "Video đã thay đổi.");
          tabs.acceptReport(report, sender);
          const signature = JSON.stringify([
            report.videoId,
            report.status,
            report.title,
            report.documentToken,
            report.generation,
          ]);
          if (reportVersions.get(sender.tab.id) !== signature) {
            reportVersions.set(sender.tab.id, signature);
            notify({
              version: 1,
              op: "invalidate",
              videoIds: report.videoId ? [report.videoId] : [],
              notebookIds: [],
            });
          }
          return { version: 1, requestId, op, ok: true, result: null };
        }
        if (op === "panel.attach") {
          if (raw.version !== 1)
            throw new AppError(
              "INVALID_INPUT",
              "Yêu cầu kết nối panel không hợp lệ.",
            );
          return {
            version: 1,
            requestId,
            op,
            ok: true,
            result: panels.attach(raw.panelSession, sender),
          };
        }
        const page =
          url.protocol === "chrome-extension:" &&
          url.hostname === extensionId &&
          (sender.origin === undefined ||
            sender.origin === `chrome-extension://${extensionId}`)
            ? url.pathname
            : "";
        if (page !== "/sidepanel.html" && page !== "/notebook.html")
          throw new AppError(
            "UNAUTHORIZED",
            "Chỉ giao diện extension được thay đổi ghi chú.",
          );
        let authority: PanelAuthority | null = null;
        if (page === "/sidepanel.html") {
          authority = panels.authorize(raw.panelSession, sender);
          if (op === "seekFromNotebook")
            throw new AppError(
              "UNAUTHORIZED",
              "Panel không được dùng thao tác của trang sổ ghi chú.",
            );
        } else if (PANEL_ONLY_OPS.includes(op))
          throw new AppError(
            "UNAUTHORIZED",
            "Trang sổ ghi chú không được dùng thao tác của panel.",
          );
        if (authority && (op === "peekQuickNote" || op === "ackQuickNote")) {
          const input = record(raw.payload);
          if (raw.version !== 1 || typeof input.windowId !== "number")
            throw new AppError(
              "INVALID_INPUT",
              "Yêu cầu ghi chú nhanh không hợp lệ.",
            );
          assertOwnWindow(authority, input.windowId);
          if (op === "ackQuickNote")
            quickNotes.ack(
              authority,
              typeof input.id === "string" ? input.id : "",
            );
          return {
            version: 1,
            requestId,
            op,
            ok: true,
            result: op === "peekQuickNote" ? quickNotes.peek(authority) : null,
          };
        }
        const request = validateRequest(raw);
        const payload = request.payload;
        if (authority) assertPanelScope(authority, request.op, payload);
        let result: unknown;
        if (request.op === "getPanelContext") {
          const context = await tabs.getPlayerContext(
            payload as { windowId: number },
          );
          if (authority && context.tabId !== authority.tabId)
            throw new AppError(
              "STALE_CONTEXT",
              "Tab ghi chú không còn đang hiển thị. Quay lại tab đó để tiếp tục.",
            );
          const data = context.videoId
            ? await repo.readVideo({ videoId: context.videoId })
            : { video: null, notes: [], drafts: [] };
          if (
            data.video &&
            context.player?.title &&
            data.video.title !== context.player.title
          )
            data.video = await repo.updateVideoTitle({
              videoId: data.video.videoId,
              title: context.player.title,
            });
          result = {
            ...context,
            data,
            notebooks: await repo.listNotebooks(),
          } satisfies PanelContext;
        } else if (request.op === "capturePlayer")
          result = await tabs.capturePlayer(
            payload as Parameters<TabCoordinator["capturePlayer"]>[0],
          );
        else if (request.op === "resumePlayer") {
          if (!authority)
            throw new AppError(
              "UNAUTHORIZED",
              "Chỉ panel được phát tiếp video.",
            );
          const resume = payload as CommandMap["resumePlayer"]["input"];
          quickNotes.assertResume(authority, {
            id: resume.quickRequestId,
            binding: resume.binding,
          });
          result = await tabs.resumePlayer(resume);
        } else if (request.op === "seekFromPanel")
          result = await tabs.seekFromPanel(
            payload as Parameters<TabCoordinator["seekFromPanel"]>[0],
          );
        else if (request.op === "seekFromNotebook")
          result = await tabs.seekFromNotebook(
            payload as Parameters<TabCoordinator["seekFromNotebook"]>[0],
          );
        else if (request.op === "openNotebook")
          result = await tabs.openNotebook(
            payload as Parameters<TabCoordinator["openNotebook"]>[0],
          );
        else if (request.op === "checkRelease")
          result = await checkRelease();
        else {
          const method = repo[request.op as keyof Repository] as (
            payload: unknown,
          ) => Promise<unknown>;
          result = await method(payload);
          const updatingDraft =
            request.op === "putDraft" &&
            record(payload).expectedRevision !== null;
          if (
            !updatingDraft &&
            !["listNotebooks", "readNotebook", "readVideo"].includes(request.op)
          )
            notify({
              version: 1,
              op: "invalidate",
              videoIds: [],
              notebookIds: [],
            });
        }
        return { version: 1, requestId, op: request.op, ok: true, result };
      } catch (error) {
        const e = asAppError(error);
        return {
          version: 1,
          requestId,
          op,
          ok: false,
          error: { code: e.code, message: e.message },
        };
      }
    },
  };
}
