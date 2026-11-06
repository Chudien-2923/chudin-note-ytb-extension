import {
  AppError,
  fail,
  type PageInspection,
  type PlayerBinding,
  type PlayerReport,
} from "../domain/types";
import { parseVideoId, resolveSeekTarget } from "../domain/identity";
export interface PlayerObserver {
  capture(): PlayerReport;
  dispose(): void;
}
export function inspectPage(doc: Document, url: URL): PageInspection {
  const videoId = parseVideoId(url);
  const result: PageInspection = {
    status: "unsupported",
    videoId,
    title: null,
    currentTime: null,
    duration: null,
    seekable: [],
  };
  if (!videoId) return result;
  result.status = "loading";
  const watch = doc.querySelector("ytd-watch-flexy:not([hidden])");
  if (!watch || watch.getAttribute("video-id") !== videoId) return result;
  const player = watch.querySelector("#movie_player");
  const media = player?.querySelector<HTMLVideoElement>(
    "video.html5-main-video, video",
  );
  // The watch heading describes the requested lesson; player metadata can describe an ad.
  result.title =
    watch
      .querySelector("ytd-watch-metadata:not([hidden]) h1, #info-contents h1")
      ?.textContent?.trim()
      .slice(0, 1000) || null;
  if (
    player?.classList.contains("ad-showing") ||
    player?.classList.contains("ad-interrupting")
  ) {
    result.status = "ad";
    return result;
  }
  const metadataId = watch
    .querySelector('meta[itemprop="videoId"]')
    ?.getAttribute("content");
  if (!result.title && metadataId === videoId) {
    const name = Array.from(
      watch.querySelectorAll('meta[itemprop="name"]'),
    ).find((node) => !player?.contains(node));
    result.title = name?.getAttribute("content")?.trim().slice(0, 1000) || null;
  }
  const titleLink = watch.querySelector<HTMLAnchorElement>(".ytp-title-link");
  if (!result.title && titleLink) {
    try {
      if (parseVideoId(new URL(titleLink.href, url)) === videoId)
        result.title = titleLink.textContent?.trim().slice(0, 1000) || null;
    } catch {
      /* Untrusted page link. */
    }
  }
  if (
    media?.duration === Infinity ||
    player?.classList.contains("ytp-live") ||
    (watch.hasAttribute("is-live") && watch.getAttribute("is-live") !== "false")
  ) {
    result.status = "live";
    return result;
  }
  if (
    media?.error ||
    watch.querySelector("ytd-player-error-message-renderer")
  ) {
    result.status = "unavailable";
    return result;
  }
  if (
    !media ||
    media.readyState < 1 ||
    !Number.isFinite(media.duration) ||
    media.duration <= 0 ||
    !Number.isFinite(media.currentTime)
  )
    return result;
  result.duration = media.duration;
  result.currentTime = media.currentTime;
  for (let i = 0; i < media.seekable.length; i++)
    result.seekable.push({
      start: media.seekable.start(i),
      end: media.seekable.end(i),
    });
  result.status = "ready";
  return result;
}
export function createPlayerObserver(
  doc: Document,
  onReport: (report: PlayerReport) => void,
): PlayerObserver {
  const win = doc.defaultView!;
  const documentToken = crypto.randomUUID();
  let generation = 0;
  let key = "";
  let media: Element | null = null;
  let navigating = false;
  let disposed = false;
  let queued = false;
  let signature = "";
  const capture = (): PlayerReport => {
    const nextKey = `${win.location.pathname}${win.location.search}`;
    const nextMedia = doc.querySelector("#movie_player video");
    if (nextKey !== key || media !== nextMedia) {
      generation++;
      key = nextKey;
      media = nextMedia;
    }
    const state = inspectPage(doc, new URL(win.location.href));
    if (navigating && state.videoId) {
      state.status = "loading";
      state.currentTime = null;
    }
    return { ...state, documentToken, generation };
  };
  const publish = () => {
    queued = false;
    if (disposed) return;
    const report = capture();
    const next = JSON.stringify([
      report.videoId,
      report.status,
      report.title,
      report.duration,
      report.documentToken,
      report.generation,
    ]);
    if (next !== signature) {
      signature = next;
      onReport(report);
    }
  };
  const schedule = () => {
    if (!queued && !disposed) {
      queued = true;
      queueMicrotask(publish);
    }
  };
  const start = () => {
    navigating = true;
    generation++;
    schedule();
  };
  const finish = () => {
    navigating = false;
    schedule();
  };
  const mutation = new win.MutationObserver(schedule);
  mutation.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["video-id", "class", "is-live", "content"],
  });
  doc.addEventListener("yt-navigate-start", start);
  doc.addEventListener("yt-navigate-finish", finish);
  win.addEventListener("popstate", finish);
  for (const event of ["loadedmetadata", "durationchange", "emptied", "error"])
    doc.addEventListener(event, schedule, true);
  schedule();
  return {
    capture,
    dispose() {
      disposed = true;
      mutation.disconnect();
      doc.removeEventListener("yt-navigate-start", start);
      doc.removeEventListener("yt-navigate-finish", finish);
      win.removeEventListener("popstate", finish);
      for (const event of [
        "loadedmetadata",
        "durationchange",
        "emptied",
        "error",
      ])
        doc.removeEventListener(event, schedule, true);
    },
  };
}
export interface SeekInput {
  getCurrentReport(): PlayerReport;
  expected: Pick<PlayerBinding, "documentToken" | "generation" | "videoId">;
  timestampSeconds: number;
}
export async function seekPlayer(
  input: SeekInput,
  media: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  const check = () => {
    if (signal.aborted)
      throw new AppError(
        "SEEK_TIMEOUT",
        "Yêu cầu tua đã hết hạn hoặc bị thay thế.",
      );
    const report = input.getCurrentReport();
    const expected = input.expected;
    if (
      report.videoId !== expected.videoId ||
      report.documentToken !== expected.documentToken ||
      report.generation !== expected.generation
    )
      fail("STALE_CONTEXT", "Video đã thay đổi. Hãy bấm timestamp lại.");
    return resolveSeekTarget(
      {
        ...report,
        binding: { ...expected, windowId: 0, tabId: 0, documentId: "" },
      },
      input.timestampSeconds,
    );
  };
  const target = check();
  media.pause();
  if (Math.abs(media.currentTime - target) <= 0.05 && !media.seeking) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      media.removeEventListener("seeked", done);
      media.removeEventListener("error", error);
      signal.removeEventListener("abort", aborted);
    };
    const done = () => {
      try {
        check();
        if (Math.abs(media.currentTime - target) > 0.75 || !media.paused)
          fail("PLAYER_UNAVAILABLE", "Player chưa tới đúng đoạn ghi chú.");
        cleanup();
        resolve();
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    const error = () => {
      cleanup();
      reject(new AppError("PLAYER_UNAVAILABLE", "Không tua được video này."));
    };
    const aborted = () => {
      cleanup();
      reject(
        new AppError(
          "SEEK_TIMEOUT",
          "Yêu cầu tua đã hết hạn hoặc bị thay thế.",
        ),
      );
    };
    media.addEventListener("seeked", done);
    media.addEventListener("error", error);
    signal.addEventListener("abort", aborted, { once: true });
    try {
      check();
      media.currentTime = target;
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export function pauseForQuickNote(
  capture: () => PlayerReport,
  media: HTMLVideoElement,
): PlayerReport {
  const before = capture();
  if (before.status !== "ready" || before.currentTime === null)
    fail("PLAYER_UNAVAILABLE", "Chờ video chính sẵn sàng để ghi chú nhanh.");
  media.pause();
  const paused = capture();
  if (
    paused.status !== "ready" ||
    paused.videoId !== before.videoId ||
    paused.documentToken !== before.documentToken ||
    paused.generation !== before.generation
  )
    fail("STALE_CONTEXT", "Video đã thay đổi trước khi ghi chú.");
  return paused;
}

export interface ResumeInput {
  getCurrentReport(): PlayerReport;
  expected: Pick<PlayerBinding, "videoId" | "generation" | "documentToken">;
}
export async function resumePlayer(
  input: ResumeInput,
  media: HTMLVideoElement,
): Promise<void> {
  const report = input.getCurrentReport();
  if (
    report.videoId !== input.expected.videoId ||
    report.documentToken !== input.expected.documentToken ||
    report.generation !== input.expected.generation
  )
    fail("STALE_CONTEXT", "Video đã thay đổi. Không tự phát video khác.");
  if (report.status !== "ready")
    fail(
      "PLAYER_UNAVAILABLE",
      "Ghi chú đã lưu, nhưng player chưa sẵn sàng để phát tiếp.",
    );
  try {
    await media.play();
  } catch {
    fail(
      "PLAYER_UNAVAILABLE",
      "Ghi chú đã lưu. Chrome chưa cho phát tiếp; hãy bấm Play.",
    );
  }
}
