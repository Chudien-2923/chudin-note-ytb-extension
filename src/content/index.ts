import {
  createPlayerObserver,
  seekPlayer,
  pauseForQuickNote,
  resumePlayer,
} from "./player";
import { AppError, asAppError, type PlayerReport } from "../domain/types";
import { parseVideoId } from "../domain/identity";
import {
  shouldOpenPanelShortcut,
  shouldStartQuickNote,
  shouldClosePanelShortcut,
} from "./keyboard";
import { createPanelHost } from "./panel-host";
let active: AbortController | null = null;
const observer = createPlayerObserver(document, (report) => {
  if (active && report.status !== "ready") active.abort();
  void chrome.runtime
    .sendMessage({ version: 1, op: "player.report", payload: report })
    .catch(() => {
      /* Extension may have been reloaded; the panel explains tab reload. */
    });
});
const panel = createPanelHost(document, {
  frameUrl: chrome.runtime.getURL("sidepanel.html"),
  onReconnect() {
    if (panel.isOpen() && !openingPanel) void openPanel(undefined, false);
  },
  onQuickNote() {
    const media = document.querySelector<HTMLVideoElement>(
      "#movie_player video",
    );
    if (!media) return;
    try {
      void openPanel(pauseForQuickNote(observer.capture, media));
    } catch (error) {
      panel.showError(asAppError(error).message);
    }
  },
});
let openingPanel = 0;
let panelSequence = 0;
async function openPanel(quickNote?: PlayerReport, reveal = true) {
  if (reveal) panel.open();
  const sequence = ++panelSequence;
  openingPanel++;
  try {
    const reply: unknown = await chrome.runtime.sendMessage({
      version: 1,
      op: "panel.open",
      requestId: crypto.randomUUID(),
      ...(quickNote ? { quickNote } : {}),
    });
    if (sequence !== panelSequence) return;
    if (
      !reply ||
      typeof reply !== "object" ||
      !("ok" in reply) ||
      reply.ok !== true ||
      !("result" in reply) ||
      !reply.result ||
      typeof reply.result !== "object" ||
      !("windowId" in reply.result) ||
      typeof reply.result.windowId !== "number" ||
      !("session" in reply.result) ||
      typeof reply.result.session !== "string"
    ) {
      throw new AppError(
        "PLAYER_UNAVAILABLE",
        "Không kết nối được panel. Reload extension rồi tải lại tab YouTube.",
      );
    }
    panel.show({
      windowId: reply.result.windowId,
      session: reply.result.session,
    });
  } catch (error) {
    if (sequence === panelSequence) panel.showError(asAppError(error).message);
  } finally {
    openingPanel--;
  }
}
const openFromKeyboard = (event: KeyboardEvent) => {
  if (!event.isTrusted || event.defaultPrevented) return;
  if (shouldClosePanelShortcut(event)) {
    if (panel.isOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      panel.hide();
    }
    return;
  }
  const quick = shouldStartQuickNote(event, event.composedPath());
  if (
    !parseVideoId(new URL(location.href)) ||
    !(quick || shouldOpenPanelShortcut(event, event.composedPath()))
  )
    return;
  let quickNote: PlayerReport | undefined;
  if (quick) {
    const media = document.querySelector<HTMLVideoElement>(
      "#movie_player video",
    );
    if (!media) return;
    try {
      quickNote = pauseForQuickNote(observer.capture, media);
    } catch (error) {
      console.warn(asAppError(error).message);
      return;
    }
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  // Focus the same-tab iframe before the asynchronous worker/storage round trip.
  void openPanel(quickNote);
};
document.addEventListener("keydown", openFromKeyboard, true);
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message !== "object"
  )
    return;
  const m = message as Record<string, unknown>;
  if (m.version === 1 && m.op === "panel.toggle") {
    if (panel.isOpen()) panel.hide();
    else void openPanel();
    respond({ ok: true });
    return;
  }
  if (
    m.version !== 1 ||
    typeof m.requestId !== "string" ||
    !["player.capture", "player.seek", "player.resume"].includes(String(m.op))
  )
    return;
  const run = async () => {
    const report = observer.capture();
    const expected = m.expected as Record<string, unknown> | undefined;
    if (
      expected &&
      (expected.videoId !== report.videoId ||
        expected.documentToken !== report.documentToken ||
        expected.generation !== report.generation)
    )
      throw new AppError("STALE_CONTEXT", "Video đã thay đổi.");
    if (m.op === "player.resume") {
      if (!expected)
        throw new AppError(
          "INVALID_INPUT",
          "Thiếu định danh video cần phát tiếp.",
        );
      const media = document.querySelector<HTMLVideoElement>(
        "#movie_player video",
      );
      if (!media)
        throw new AppError(
          "PLAYER_UNAVAILABLE",
          "Không còn player để phát tiếp.",
        );
      await resumePlayer(
        {
          getCurrentReport: observer.capture,
          expected: {
            videoId: report.videoId!,
            documentToken: report.documentToken,
            generation: report.generation,
          },
        },
        media,
      );
    }
    if (m.op === "player.seek") {
      if (
        !expected ||
        typeof m.timestampSeconds !== "number" ||
        typeof m.expiresAt !== "string"
      )
        throw new AppError("INVALID_INPUT", "Yêu cầu tua không hợp lệ.");
      const remaining = Date.parse(m.expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15000)
        throw new AppError("SEEK_TIMEOUT", "Yêu cầu tua hết hạn.");
      const media = document.querySelector<HTMLVideoElement>(
        "#movie_player video",
      );
      if (!media)
        throw new AppError("PLAYER_UNAVAILABLE", "Chưa tìm thấy player.");
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const timeout = setTimeout(() => controller.abort(), remaining);
      try {
        await seekPlayer(
          {
            getCurrentReport: observer.capture,
            expected: {
              documentToken: report.documentToken,
              generation: report.generation,
              videoId: report.videoId!,
            },
            timestampSeconds: m.timestampSeconds,
          },
          media,
          controller.signal,
        );
      } finally {
        clearTimeout(timeout);
        if (active === controller) active = null;
      }
    }
    const result = observer.capture();
    // Re-register sender document identity even if the worker restarted since our last report.
    await chrome.runtime.sendMessage({
      version: 1,
      op: "player.report",
      payload: result,
    });
    return result;
  };
  void run()
    .then((result) =>
      respond({ version: 1, requestId: m.requestId, ok: true, result }),
    )
    .catch((error) => {
      const e = asAppError(error);
      respond({
        version: 1,
        requestId: m.requestId,
        ok: false,
        error: { code: e.code, message: e.message },
      });
    });
  return true;
});
window.addEventListener(
  "pagehide",
  () => {
    active?.abort();
    observer.dispose();
    panel.dispose();
    document.removeEventListener("keydown", openFromKeyboard, true);
  },
  { once: true },
);
