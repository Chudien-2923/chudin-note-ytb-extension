/** Private lifecycle channel between the YouTube content script and the extension-origin panel iframe. */
export const PANEL_CHANNEL = "chudin-note-panel";
/** The only page origin that may host the panel frame. */
export const PANEL_PARENT_ORIGIN = "https://www.youtube.com";
export type FrameLifecycle = "ready" | "reconnect" | "quick" | "close";
export interface PanelSessionGrant {
  windowId: number;
  session: string;
}
function envelope(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  return message.channel === PANEL_CHANNEL && message.version === 1
    ? message
    : null;
}
/** Exact postMessage origin of an extension page; URL.origin is unreliable for extension schemes. */
export function extensionOrigin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "chrome-extension:" || !parsed.host)
    throw new Error("Panel frame must be an extension page.");
  return `chrome-extension://${parsed.host}`;
}
export function lifecycleMessage(type: FrameLifecycle) {
  return { channel: PANEL_CHANNEL, version: 1, type };
}
export function parseLifecycle(data: unknown): FrameLifecycle | null {
  const type = envelope(data)?.type;
  return type === "ready" ||
    type === "reconnect" ||
    type === "quick" ||
    type === "close"
    ? type
    : null;
}
export function sessionMessage(grant: PanelSessionGrant) {
  return {
    channel: PANEL_CHANNEL,
    version: 1,
    type: "session",
    session: grant.session,
    windowId: grant.windowId,
  };
}
export function parseSession(data: unknown): PanelSessionGrant | null {
  const message = envelope(data);
  if (!message || message.type !== "session") return null;
  const { session, windowId } = message;
  if (
    typeof session !== "string" ||
    session.length === 0 ||
    session.length > 4096 ||
    !Number.isSafeInteger(windowId) ||
    (windowId as number) < 0
  )
    return null;
  return { session, windowId: windowId as number };
}
