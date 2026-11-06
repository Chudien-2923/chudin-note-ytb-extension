import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createPanelLayout } from "../src/content/panel-layout";

let dom: JSDOM;
let doc: Document;
let fullscreen: Element | null;
beforeEach(() => {
  dom = new JSDOM(
    `<html style="margin-right:3px!important;color:red"><head></head><body><div id="movie_player"><div class="html5-video-container"><video></video></div><div class="ytp-chrome-top"></div><div class="ytp-caption-window-container"><div class="caption-window">Phụ đề</div></div><div class="ytp-chrome-bottom"></div><div class="ytp-gradient-bottom"></div></div></body></html>`,
    { url: "https://www.youtube.com/watch?v=abcdefghijk" },
  );
  doc = dom.window.document;
  fullscreen = null;
  Object.defineProperty(doc, "fullscreenElement", { get: () => fullscreen });
  Object.defineProperties(dom.window, {
    innerWidth: { configurable: true, value: 1600 },
    innerHeight: { configurable: true, value: 900 },
  });
});
afterEach(() => dom.window.close());

it.each([
  { big: false, expectedRight: "432px", restoredRight: "12px" },
  { big: true, expectedRight: "444px", restoredRight: "24px" },
])(
  "keeps the settings menu before the note panel in big mode=$big and restores its native anchor",
  ({ big, expectedRight, restoredRight }) => {
    const base = doc.createElement("style");
    base.textContent =
      ".ytp-settings-menu { position:absolute; right:12px; width:300px; } .ytp-big-mode .ytp-settings-menu { right:24px; }";
    doc.head.append(base);
    const player = doc.querySelector<HTMLElement>("#movie_player")!;
    fullscreen = player;
    if (big) player.classList.add("ytp-big-mode");
    const menu = doc.createElement("div");
    menu.className = "ytp-popup ytp-settings-menu";
    player.append(menu);
    const layout = createPanelLayout(doc, 420);
    layout.show();
    expect(dom.window.getComputedStyle(menu).right).toBe(expectedRight);
    expect(dom.window.getComputedStyle(menu).maxWidth).toBe(
      big ? "1132px" : "1156px",
    );
    layout.hide();
    expect(dom.window.getComputedStyle(menu).right).toBe(restoredRight);
    layout.dispose();
  },
);

it.each(["native", "youtube"])(
  "fits media, captions and controls before the panel in %s fullscreen without shrinking the fullscreen root",
  (mode) => {
    const player = doc.querySelector<HTMLElement>("#movie_player")!;
    player.style.width = "1600px";
    player.style.height = "900px";
    if (mode === "native") fullscreen = player;
    else player.classList.add("ytp-fullscreen");
    const video = doc.querySelector("video")!;
    const originalWidth = dom.window.getComputedStyle(video).width;
    const layout = createPanelLayout(doc, 420);
    expect(layout.show()).toBe(420);
    const media = dom.window.getComputedStyle(video);
    expect(media.width).toBe("1180px");
    expect(media.height).toBe("900px");
    expect(media.objectFit).toBe("contain");
    for (const selector of [
      ".html5-video-container",
      ".ytp-chrome-top",
      ".ytp-caption-window-container",
      ".ytp-gradient-bottom",
    ])
      expect(
        dom.window.getComputedStyle(doc.querySelector(selector)!).width,
      ).toBe("1180px");
    const controls = dom.window.getComputedStyle(
      doc.querySelector(".ytp-chrome-bottom")!,
    );
    expect(controls.left).toBe("12px");
    expect(controls.width).toBe("1156px");
    expect(player.style.width).toBe("1600px");
    expect(player.style.height).toBe("900px");
    expect(doc.documentElement.style.marginRight).toBe("3px");
    layout.hide();
    expect(dom.window.getComputedStyle(video).width).toBe(originalWidth);
    expect(player.hasAttribute("data-chudin-note-split")).toBe(false);
    expect(player.style.width).toBe("1600px");
    layout.dispose();
  },
);

it("recomputes a narrow fullscreen split and restores all owned layout when returning to ordinary viewing", () => {
  const player = doc.querySelector<HTMLElement>("#movie_player")!;
  const video = doc.querySelector("video")!;
  const layout = createPanelLayout(doc, 420);
  expect(layout.show()).toBe(420);
  expect(doc.documentElement.style.marginRight).toBe("420px");
  fullscreen = player;
  Object.defineProperties(dom.window, {
    innerWidth: { value: 640 },
    innerHeight: { value: 480 },
  });
  expect(layout.show()).toBe(320);
  expect(dom.window.getComputedStyle(video).width).toBe("320px");
  expect(dom.window.getComputedStyle(video).height).toBe("480px");
  expect(doc.documentElement.style.marginRight).toBe("3px");
  fullscreen = null;
  expect(layout.show()).toBe(420);
  expect(player.hasAttribute("data-chudin-note-split")).toBe(false);
  expect(doc.documentElement.style.marginRight).toBe("420px");
  layout.hide();
  expect(doc.documentElement.style.marginRight).toBe("3px");
  expect(doc.documentElement.style.getPropertyPriority("margin-right")).toBe(
    "important",
  );
  expect(doc.documentElement.style.color).toBe("red");
  layout.dispose();
});

it("releases a replaced player and never overwrites page-owned inline video layout or a changed marker", () => {
  const first = doc.querySelector<HTMLElement>("#movie_player")!;
  first.setAttribute("data-chudin-note-split", "before");
  first.classList.add("ytp-fullscreen");
  const video = first.querySelector("video")!;
  video.style.cssText = "width:1600px;height:900px;left:0px;top:0px";
  const originalVideoStyle = video.getAttribute("style");
  const layout = createPanelLayout(doc, 420);
  layout.show();
  const next = doc.createElement("div");
  next.id = "movie_player";
  next.className = "ytp-fullscreen";
  next.append(doc.createElement("video"));
  first.replaceWith(next);
  layout.show();
  expect(first.getAttribute("data-chudin-note-split")).toBe("before");
  expect(video.getAttribute("style")).toBe(originalVideoStyle);
  expect(next.hasAttribute("data-chudin-note-split")).toBe(true);
  next.setAttribute("data-chudin-note-split", "page-change");
  layout.dispose();
  expect(next.getAttribute("data-chudin-note-split")).toBe("page-change");
  expect(doc.querySelectorAll("style")).toHaveLength(0);
});

it("updates ordinary reservation on resize and restores a concurrent page margin change on hide", () => {
  const layout = createPanelLayout(doc, 420);
  layout.show();
  doc.documentElement.style.setProperty("margin-right", "17px");
  Object.defineProperty(dom.window, "innerWidth", { value: 300 });
  expect(layout.show()).toBe(300);
  expect(doc.documentElement.style.marginRight).toBe("300px");
  layout.hide();
  expect(doc.documentElement.style.marginRight).toBe("17px");
  expect(doc.documentElement.style.getPropertyPriority("margin-right")).toBe(
    "",
  );
  layout.dispose();
});
