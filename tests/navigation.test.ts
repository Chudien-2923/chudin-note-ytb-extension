import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import type { PlayerReport } from "../src/domain/types";
import {
  inspectPage,
  createPlayerObserver,
  seekPlayer,
  pauseForQuickNote,
  resumePlayer,
} from "../src/content/player";
const url = "https://www.youtube.com/watch?v=abcdefghijk";
function fixture() {
  const dom = new JSDOM(
    '<ytd-watch-flexy video-id="abcdefghijk"><meta itemprop="videoId" content="abcdefghijk"><meta itemprop="name" content="Bài học"><div id="movie_player"><video class="html5-main-video"></video></div></ytd-watch-flexy>',
    { url },
  );
  const video = dom.window.document.querySelector("video")!;
  Object.defineProperties(video, {
    duration: { value: 100, configurable: true },
    readyState: { value: 4, configurable: true },
    seekable: { value: { length: 1, start: () => 0, end: () => 100 } },
  });
  return { dom, video, doc: dom.window.document };
}
describe("player authority", () => {
  it("does not capture stale page metadata for a new video URL", () => {
    const { doc, dom } = fixture();
    expect(inspectPage(doc, new URL(url))).toMatchObject({
      status: "ready",
      videoId: "abcdefghijk",
      title: "Bài học",
    });
    expect(
      inspectPage(doc, new URL("https://www.youtube.com/watch?v=lmnopqrstuv"))
        .status,
    ).toBe("loading");
    dom.window.close();
  });
  it("refuses ad/live timestamps", () => {
    const { doc, dom, video } = fixture();
    doc.querySelector("#movie_player")!.classList.add("ad-showing");
    expect(inspectPage(doc, new URL(url)).status).toBe("ad");
    doc.querySelector("#movie_player")!.classList.remove("ad-showing");
    Object.defineProperty(video, "duration", { value: Infinity });
    expect(inspectPage(doc, new URL(url)).status).toBe("live");
    dom.window.close();
  });
  it("invalidates an earlier visit after A→B→A and media replacement", () => {
    const { doc, dom } = fixture();
    const observer = createPlayerObserver(doc, () => {});
    const first = observer.capture();
    dom.window.history.pushState(null, "", "/watch?v=lmnopqrstuv");
    observer.capture();
    dom.window.history.pushState(null, "", "/watch?v=abcdefghijk");
    const again = observer.capture();
    expect(again.generation).toBeGreaterThan(first.generation);
    doc.querySelector("video")!.replaceWith(doc.createElement("video"));
    expect(observer.capture().generation).toBeGreaterThan(again.generation);
    observer.dispose();
    dom.window.close();
  });
  it("rejects stale seeks without pausing or modifying playback", async () => {
    const { doc, dom, video } = fixture();
    const observer = createPlayerObserver(doc, () => {});
    const report = observer.capture();
    await expect(
      seekPlayer(
        {
          getCurrentReport: observer.capture,
          expected: { ...report, videoId: "lmnopqrstuv" },
          timestampSeconds: 80,
        },
        video,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "STALE_CONTEXT" });
    expect(video.currentTime).toBe(0);
    observer.dispose();
    dom.window.close();
  });
});
it("uses the actual watch heading instead of advertiser metadata during an ad", () => {
  const { doc, dom } = fixture();
  doc
    .querySelector('meta[itemprop="name"]')!
    .setAttribute("content", "YTM BAC EMP advertisement");
  const metadata = doc.createElement("ytd-watch-metadata");
  const heading = doc.createElement("h1");
  heading.textContent = "What I'd Learn Instead of Prompt Engineering";
  metadata.append(heading);
  doc.querySelector("ytd-watch-flexy")!.append(metadata);
  doc.querySelector("#movie_player")!.classList.add("ad-showing");
  expect(inspectPage(doc, new URL(url))).toMatchObject({
    status: "ad",
    title: "What I'd Learn Instead of Prompt Engineering",
    currentTime: null,
  });
  dom.window.close();
});
it("does not publish an advertiser title when no canonical watch heading is ready", () => {
  const { doc, dom } = fixture();
  doc
    .querySelector('meta[itemprop="name"]')!
    .setAttribute("content", "Advertiser");
  doc.querySelector("#movie_player")!.classList.add("ad-showing");
  expect(inspectPage(doc, new URL(url))).toMatchObject({
    status: "ad",
    title: null,
    currentTime: null,
  });
  dom.window.close();
});
it("reports main-video readiness and its own time once an ad ends", async () => {
  const { doc, dom, video } = fixture();
  const player = doc.querySelector("#movie_player")!;
  player.classList.add("ad-showing");
  video.currentTime = 4;
  const reports: string[] = [];
  let readyReport: ((value: PlayerReport) => void) | undefined;
  const readyPromise = new Promise<PlayerReport>((resolve) => {
    readyReport = resolve;
  });
  const observer = createPlayerObserver(doc, (report) => {
    reports.push(report.status);
    if (report.status === "ready") readyReport!(report);
  });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  player.classList.remove("ad-showing");
  video.currentTime = 83;
  const ready = await readyPromise;
  expect(reports).toEqual(["ad", "ready"]);
  expect(ready.currentTime).toBe(83);
  observer.dispose();
  dom.window.close();
});
it("pauses synchronously and captures the main video's exact time for a quick note", () => {
  const { doc, dom, video } = fixture();
  let paused = false;
  video.currentTime = 83.25;
  video.pause = () => {
    paused = true;
  };
  const observer = createPlayerObserver(doc, () => {});
  const report = pauseForQuickNote(observer.capture, video);
  expect(paused).toBe(true);
  expect(report.currentTime).toBe(83.25);
  doc.querySelector("#movie_player")!.classList.add("ad-showing");
  paused = false;
  expect(() => pauseForQuickNote(observer.capture, video)).toThrow();
  expect(paused).toBe(false);
  observer.dispose();
  dom.window.close();
});
it("resumes only the same ready video and never another navigation generation", async () => {
  const { doc, dom, video } = fixture();
  const observer = createPlayerObserver(doc, () => {});
  const original = observer.capture();
  let playing = false;
  Object.defineProperty(video, "paused", { get: () => !playing });
  video.play = async () => {
    playing = true;
  };
  await resumePlayer(
    {
      getCurrentReport: observer.capture,
      expected: {
        documentToken: original.documentToken,
        generation: original.generation,
        videoId: original.videoId!,
      },
    },
    video,
  );
  expect(playing).toBe(true);
  playing = false;
  dom.window.history.pushState(null, "", "/watch?v=lmnopqrstuv");
  await expect(
    resumePlayer(
      {
        getCurrentReport: observer.capture,
        expected: {
          documentToken: original.documentToken,
          generation: original.generation,
          videoId: original.videoId!,
        },
      },
      video,
    ),
  ).rejects.toMatchObject({ code: "STALE_CONTEXT" });
  expect(playing).toBe(false);
  observer.dispose();
  dom.window.close();
});
