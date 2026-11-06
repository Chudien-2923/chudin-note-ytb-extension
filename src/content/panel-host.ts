import {
  extensionOrigin,
  parseLifecycle,
  sessionMessage,
  type PanelSessionGrant,
} from "../panel/frame-protocol";
import { createPanelLayout } from "./panel-layout";
const PANEL_WIDTH = 420;
const STYLE = `
:host { all: initial; color-scheme: light dark; }
.panel { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; background: Canvas; color: CanvasText; border-left: 1px solid GrayText; font: 13px system-ui, sans-serif; }
.bar { display: flex; justify-content: flex-end; flex: none; padding: 2px 4px; border-bottom: 1px solid GrayText; }
.close { font: inherit; min-width: 28px; min-height: 28px; cursor: pointer; }
.status { flex: none; margin: 0; padding: 8px 12px; }
.status[hidden] { display: none; }
iframe { flex: 1; min-height: 0; width: 100%; border: 0; background: Canvas; }
`;
export interface PanelHostOptions {
  /** chrome.runtime.getURL("sidepanel.html") */
  frameUrl: string;
  /** The frame lost its authority; the integration should obtain a new session and call show(). */
  onReconnect(): void;
  /** The authenticated frame saw Option+N outside an editable field: capture/pause and open as the page shortcut does. */
  onQuickNote?(): void;
}
export interface PanelHost {
  /** Creates (once), reveals and focuses the frame synchronously. Call before awaiting the worker. */
  open(): void;
  /** Hands the session to the frame privately. Reveals only if the panel was never opened or hidden. */
  show(grant: PanelSessionGrant): void;
  /** Replaces the host status line with a plain-text failure. */
  showError(message: string): void;
  /** Hides without destroying the frame, preserving its input. */
  hide(): void;
  dispose(): void;
  isOpen(): boolean;
}
interface Parts {
  element: HTMLElement;
  frame: HTMLIFrameElement;
  status: HTMLElement;
}
export function createPanelHost(
  doc: Document,
  options: PanelHostOptions,
): PanelHost {
  const win = doc.defaultView!;
  const origin = extensionOrigin(options.frameUrl);
  let parts: Parts | undefined;
  const layout = createPanelLayout(doc, PANEL_WIDTH);
  let observer: MutationObserver | undefined;
  let visible = false;
  let disposed = false;
  let frameReady = false;
  let delivered = false;
  let pending: PanelSessionGrant | undefined;
  function leaveTopLayer() {
    const element = parts?.element;
    if (!element?.hasAttribute("popover")) return;
    element.hidePopover();
    element.removeAttribute("popover");
  }
  function syncLayout() {
    if (!visible || !parts || disposed) return;
    parts.element.style.setProperty("width", `${layout.show()}px`, "important");
    if (doc.fullscreenElement) {
      // A fixed sibling is behind a native fullscreen element regardless of z-index.
      // Top-layer presentation avoids reparenting (and reloading) the note iframe.
      parts.element.setAttribute("popover", "manual");
      parts.element.togglePopover(true);
    } else leaveTopLayer();
  }
  function flush() {
    const frameWindow = parts?.frame.contentWindow;
    if (!pending || !frameWindow || !parts) return;
    frameWindow.postMessage(sessionMessage(pending), origin);
    pending = undefined;
    delivered = true;
    parts.status.hidden = true;
    parts.status.textContent = "";
  }
  const onMessage = (event: MessageEvent) => {
    const frameWindow = parts?.frame.contentWindow;
    if (!frameWindow || event.source !== frameWindow || event.origin !== origin)
      return;
    const type = parseLifecycle(event.data);
    if (!type) return;
    if (type === "close") {
      hide();
      return;
    }
    if (type === "quick") {
      if (visible) options.onQuickNote?.();
      return;
    }
    frameReady = true;
    if (pending) flush();
    // A first "ready" while panel.open is still pending must not start a second open.
    else if (type === "reconnect" || delivered) options.onReconnect();
  };
  function ensure(): Parts {
    if (parts) return parts;
    const element = doc.createElement("div");
    for (const [name, value] of [
      ["position", "fixed"],
      ["top", "0"],
      ["right", "0"],
      ["bottom", "0"],
      ["left", "auto"],
      ["margin", "0"],
      ["padding", "0"],
      ["border", "0"],
      ["max-width", "100vw"],
      ["z-index", "2147483647"],
      ["display", "none"],
    ])
      element.style.setProperty(name, value, "important");
    const shadow = element.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = STYLE;
    const panel = doc.createElement("div");
    panel.className = "panel";
    const bar = doc.createElement("div");
    bar.className = "bar";
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "Đóng ghi chú";
    close.setAttribute("aria-label", "Đóng ghi chú");
    close.addEventListener("click", hide);
    bar.append(close);
    const status = doc.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");
    status.textContent = "Đang kết nối…";
    const frame = doc.createElement("iframe");
    frame.title = "Ghi chú YouTube";
    frame.src = options.frameUrl;
    panel.append(bar, status, frame);
    shadow.append(style, panel);
    doc.documentElement.append(element);
    win.addEventListener("message", onMessage);
    parts = { element, frame, status };
    win.addEventListener("resize", syncLayout);
    doc.addEventListener("fullscreenchange", syncLayout);
    observer = new win.MutationObserver(syncLayout);
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return parts;
  }
  function open() {
    if (disposed) return;
    const { element, frame } = ensure();
    visible = true;
    element.style.setProperty("display", "block", "important");
    syncLayout();
    // Must stay synchronous so the user gesture's keyboard focus lands in the frame.
    frame.focus();
    frame.contentWindow?.focus();
  }
  function hide() {
    if (!parts) return;
    visible = false;
    leaveTopLayer();
    parts.element.style.setProperty("display", "none", "important");
    layout.hide();
  }
  return {
    open,
    show(grant) {
      if (disposed) return;
      if (!parts) open();
      pending = grant;
      if (frameReady) flush();
    },
    showError(message) {
      if (disposed) return;
      if (!parts) open();
      const { status } = parts!;
      status.textContent = message;
      status.setAttribute("role", "alert");
      status.hidden = false;
    },
    hide,
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = false;
      pending = undefined;
      win.removeEventListener("message", onMessage);
      win.removeEventListener("resize", syncLayout);
      doc.removeEventListener("fullscreenchange", syncLayout);
      observer?.disconnect();
      parts?.element.remove();
      parts = undefined;
      layout.dispose();
    },
    isOpen: () => visible,
  };
}
