import { AppError } from "../domain/types";
import { senderVideoId } from "./sender";

const YOUTUBE_ORIGIN = "https://www.youtube.com";
const MAX_TOKEN_LENGTH = 256;

/** The authenticated top-frame YouTube document that may host a panel. */
export interface PanelHost {
  tabId: number;
  windowId: number;
  documentId: string;
}
/** Returned to the trusted content script; it hands `session` privately to its panel frame. */
export interface PanelGrant {
  windowId: number;
  session: string;
}
/** What an authenticated panel frame is allowed to act on. */
export interface PanelAuthority {
  tabId: number;
  windowId: number;
  hostDocumentId: string;
  frameDocumentId: string;
}
export interface PanelSessions {
  /** Issue (or reuse for the same top document) the session of a trusted active top frame. */
  open(sender: chrome.runtime.MessageSender): PanelGrant;
  /** Validate the sender as a trusted active top frame without issuing a session. */
  trustedHost(sender: chrome.runtime.MessageSender): PanelHost;
  /** Bind a session to the calling extension frame document; the last attach replaces the old frame. */
  attach(
    token: unknown,
    sender: chrome.runtime.MessageSender,
  ): { windowId: number };
  /** Resolve the authority of an already attached frame, or throw. */
  authorize(
    token: unknown,
    sender: chrome.runtime.MessageSender,
  ): PanelAuthority;
  /** A report from the tab's top document: a different document than the session's expires it. */
  observeTopDocument(sender: chrome.runtime.MessageSender): void;
  revokeTab(tabId: number): void;
}
interface Session {
  token: string;
  tabId: number;
  windowId: number;
  hostDocumentId: string;
  frameDocumentId: string | null;
}
const unauthorized = (message: string) => new AppError("UNAUTHORIZED", message);
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function tabIsYoutube(tab: chrome.tabs.Tab): boolean {
  if (tab.url === undefined) return true;
  try {
    return new URL(tab.url).origin === YOUTUBE_ORIGIN;
  } catch {
    return false;
  }
}
export function createPanelSessions(extensionId: string): PanelSessions {
  const extensionOrigin = `chrome-extension://${extensionId}`;
  const byToken = new Map<string, Session>();
  const byTab = new Map<number, Session>();
  const drop = (session: Session) => {
    byToken.delete(session.token);
    if (byTab.get(session.tabId) === session) byTab.delete(session.tabId);
  };
  const trustedHost = (sender: chrome.runtime.MessageSender): PanelHost => {
    const watching = senderVideoId(sender);
    const tab = sender.tab;
    if (
      sender.id !== extensionId ||
      sender.frameId !== 0 ||
      !sender.documentId ||
      !watching ||
      !tab?.active ||
      !isId(tab.id) ||
      !isId(tab.windowId)
    )
      throw unauthorized(
        "Chỉ trang video YouTube đang hiển thị được mở panel ghi chú.",
      );
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      documentId: sender.documentId,
    };
  };
  const assertPanelFrame = (sender: chrome.runtime.MessageSender) => {
    let path = "";
    let hostname = "";
    let protocol = "";
    try {
      const url = new URL(sender.url ?? "about:blank");
      ({ pathname: path, hostname, protocol } = url);
    } catch {
      /* Falls through to rejection. */
    }
    const tab = sender.tab;
    if (
      sender.id !== extensionId ||
      protocol !== "chrome-extension:" ||
      hostname !== extensionId ||
      path !== "/sidepanel.html" ||
      (sender.origin !== undefined && sender.origin !== extensionOrigin) ||
      !isId(sender.frameId) ||
      sender.frameId === 0 ||
      !sender.documentId ||
      !tab ||
      !isId(tab.id) ||
      !isId(tab.windowId) ||
      !tabIsYoutube(tab)
    )
      throw unauthorized("Chỉ khung ghi chú nhúng trong YouTube được phép.");
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      documentId: sender.documentId,
    };
  };
  const find = (token: unknown, frame: PanelHost): Session => {
    if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH)
      throw unauthorized("Thiếu phiên xác thực của panel.");
    const session = byToken.get(token);
    // Unknown means a restarted worker, a replaced document or a guess: the frame must reconnect through its host.
    if (!session)
      throw unauthorized(
        "Phiên panel cần kết nối lại. Ghi chú đã lưu và nội dung đang nhập vẫn được giữ.",
      );
    if (frame.tabId !== session.tabId)
      throw unauthorized("Phiên panel không thuộc tab này.");
    if (frame.windowId !== session.windowId)
      throw unauthorized(
        "Tab đã đổi cửa sổ; panel cần kết nối lại. Nội dung đang nhập vẫn được giữ.",
      );
    return session;
  };
  return {
    trustedHost,
    open(sender) {
      const host = trustedHost(sender);
      const existing = byTab.get(host.tabId);
      if (existing?.hostDocumentId === host.documentId) {
        existing.windowId = host.windowId;
        return { windowId: existing.windowId, session: existing.token };
      }
      if (existing) drop(existing);
      const session: Session = {
        token: newToken(),
        tabId: host.tabId,
        windowId: host.windowId,
        hostDocumentId: host.documentId,
        frameDocumentId: null,
      };
      byToken.set(session.token, session);
      byTab.set(session.tabId, session);
      return { windowId: session.windowId, session: session.token };
    },
    attach(token, sender) {
      const frame = assertPanelFrame(sender);
      const session = find(token, frame);
      session.frameDocumentId = frame.documentId;
      return { windowId: session.windowId };
    },
    authorize(token, sender) {
      const frame = assertPanelFrame(sender);
      const session = find(token, frame);
      if (session.frameDocumentId !== frame.documentId)
        throw unauthorized("Khung panel này chưa được xác thực.");
      return {
        tabId: session.tabId,
        windowId: session.windowId,
        hostDocumentId: session.hostDocumentId,
        frameDocumentId: frame.documentId,
      };
    },
    observeTopDocument(sender) {
      let origin = "";
      try {
        origin = new URL(sender.url ?? "about:blank").origin;
      } catch {
        return;
      }
      const tabId = sender.tab?.id;
      if (
        sender.id !== extensionId ||
        sender.frameId !== 0 ||
        !sender.documentId ||
        origin !== YOUTUBE_ORIGIN ||
        !isId(tabId)
      )
        return;
      const session = byTab.get(tabId);
      if (session && session.hostDocumentId !== sender.documentId)
        drop(session);
    },
    revokeTab(tabId) {
      const session = byTab.get(tabId);
      if (session) drop(session);
    },
  };
}
