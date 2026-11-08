import { parseVideoId } from "../domain/identity";

/** Chrome's content-script URL may predate SPA navigation; the tab snapshot has the current route. */
export function senderVideoId(sender: chrome.runtime.MessageSender): string | null {
  if (sender.frameId !== 0) return null;
  try {
    const source = new URL(sender.url ?? "about:blank");
    if (source.origin !== "https://www.youtube.com") return null;
    // Only fall back when Chrome omits the tab URL, never when that route is unsupported.
    return parseVideoId(new URL(sender.tab?.url ?? source.href));
  } catch {
    return null;
  }
}
