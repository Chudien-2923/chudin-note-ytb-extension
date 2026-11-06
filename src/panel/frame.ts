import {
  shouldStartQuickNote,
  shouldClosePanelShortcut,
} from "../content/keyboard";
import type { Client, ClientAuth } from "../ui/client";
import type { Mounted } from "../ui/shared";
import type { MountedPanel } from "./controller";
import {
  PANEL_PARENT_ORIGIN,
  lifecycleMessage,
  parseSession,
  type FrameLifecycle,
  type PanelSessionGrant,
} from "./frame-protocol";
const MAX_AUTOMATIC_RECONNECTS = 3;
export interface PanelFrameDeps {
  window: Window;
  root: HTMLElement;
  attach(session: string): Promise<{ windowId: number }>;
  createClient(auth: ClientAuth): Client;
  mount(
    root: HTMLElement,
    client: Client,
    init: { windowId: number },
  ): MountedPanel;
}
/**
 * Waits for the host's private session handshake, proves it to the worker with
 * panel.attach, then mounts the panel once. Later sessions replace the token
 * without remounting, so local editor state survives reauthentication.
 */
export function startPanelFrame(deps: PanelFrameDeps): Mounted {
  const { window: win, root } = deps;
  let token: string | undefined;
  let mounted: MountedPanel | undefined;
  let awaiting = true;
  let attaching = false;
  let disposed = false;
  let failures = 0;
  let queuedGrant: PanelSessionGrant | undefined;
  const status = root.ownerDocument.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  const tell = (text: string) => {
    if (mounted) return;
    status.textContent = text;
    if (!status.isConnected) root.replaceChildren(status);
  };
  const post = (type: FrameLifecycle) =>
    win.parent.postMessage(lifecycleMessage(type), PANEL_PARENT_ORIGIN);
  async function authenticate(grant: PanelSessionGrant) {
    attaching = true;
    awaiting = false;
    const previousToken = token;
    try {
      const { windowId } = await deps.attach(grant.session);
      if (disposed) return;
      if (windowId !== grant.windowId)
        throw new Error("Panel session belongs to another window.");
      failures = 0;
      token = grant.session;
      if (!mounted) {
        root.replaceChildren();
        const client = deps.createClient({
          session: () => token,
          onAuthFailure: reconnect,
        });
        mounted = deps.mount(root, client, { windowId });
      } else mounted.refresh(windowId);
    } catch {
      if (disposed) return;
      // A page can forge a parent message, but cannot prove a token to the worker.
      // A rejected offer must not clear an already authenticated live editor.
      if (!previousToken) {
        token = undefined;
        awaiting = true;
        failures++;
        tell("Không thể xác thực phiên ghi chú. Đang kết nối lại…");
        if (failures <= MAX_AUTOMATIC_RECONNECTS) post("reconnect");
      }
    } finally {
      attaching = false;
      if (queuedGrant && !disposed) {
        const next = queuedGrant;
        queuedGrant = undefined;
        void authenticate(next);
      }
    }
  }
  function reconnect() {
    if (disposed || awaiting || attaching) return;
    token = undefined;
    awaiting = true;
    post("reconnect");
  }
  const onMessage = (event: MessageEvent) => {
    if (
      disposed ||
      event.source !== win.parent ||
      event.origin !== PANEL_PARENT_ORIGIN
    )
      return;
    const grant = parseSession(event.data);
    if (!grant) return;
    if (attaching) queuedGrant = grant;
    else void authenticate(grant);
  };
  // A fresh in-frame button keeps keyboard focus after saving, so the page never sees Option+N.
  const onKey = (event: KeyboardEvent) => {
    if (disposed || event.defaultPrevented) return;
    if (shouldClosePanelShortcut(event)) {
      event.preventDefault();
      post("close");
      return;
    }
    if (!mounted || !shouldStartQuickNote(event, event.composedPath())) return;
    event.preventDefault();
    post("quick");
  };
  win.addEventListener("message", onMessage);
  win.addEventListener("keydown", onKey);
  tell("Đang kết nối với YouTube…");
  post("ready");
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener("message", onMessage);
      win.removeEventListener("keydown", onKey);
      mounted?.dispose();
    },
  };
}
