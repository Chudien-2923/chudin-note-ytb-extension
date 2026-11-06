import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  shouldOpenPanelShortcut,
  shouldStartQuickNote,
  shouldClosePanelShortcut,
  type ShortcutKey,
} from "../src/content/keyboard";
import { handleToolbarClick } from "../src/background/panel-shortcut";

function key(overrides: Partial<ShortcutKey> = {}): ShortcutKey {
  return {
    key: "n",
    code: "KeyN",
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 78,
    ...overrides,
  };
}
describe("page-local N shortcut", () => {
  it("accepts only unmodified N, including Caps Lock, outside typing", () => {
    expect(shouldOpenPanelShortcut(key(), [])).toBe(true);
    expect(shouldOpenPanelShortcut(key({ key: "N" }), [])).toBe(true);
    for (const modified of [
      { key: "m" },
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { repeat: true },
      { isComposing: true },
      { keyCode: 229 },
    ])
      expect(shouldOpenPanelShortcut(key(modified), [])).toBe(false);
  });
  it("leaves N inside editable fields, rich text and shadow editors untouched", () => {
    const dom = new JSDOM(
      '<input><textarea></textarea><select></select><div contenteditable="true"><span id="rich"></span></div><div role="textbox"><span id="role"></span></div><div id="host"></div><button>Player</button>',
    );
    try {
      for (const selector of ["input", "textarea", "select", "#rich", "#role"])
        expect(
          shouldOpenPanelShortcut(key(), [
            dom.window.document.querySelector(selector)!,
          ]),
        ).toBe(false);
      const host = dom.window.document.querySelector("#host")!;
      const shadow = host.attachShadow({ mode: "open" });
      const input = dom.window.document.createElement("input");
      shadow.append(input);
      expect(shouldOpenPanelShortcut(key(), [input, shadow, host])).toBe(false);
      expect(
        shouldOpenPanelShortcut(key(), [
          dom.window.document.querySelector("button")!,
        ]),
      ).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});

describe("Option+Command+N closes notes", () => {
  it("recognizes the physical chord, including the macOS dead key, without changing N or Option+N", () => {
    const chord = key({ key: "Dead", altKey: true, metaKey: true });
    expect(shouldClosePanelShortcut(chord)).toBe(true);
    expect(shouldOpenPanelShortcut(chord, [])).toBe(false);
    expect(shouldStartQuickNote(chord, [])).toBe(false);
    expect(shouldClosePanelShortcut(key())).toBe(false);
    expect(shouldClosePanelShortcut(key({ altKey: true }))).toBe(false);
    for (const extra of [
      { ctrlKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
      { keyCode: 229 },
      { code: "KeyM" },
      { altKey: false },
      { metaKey: false },
    ])
      expect(shouldClosePanelShortcut({ ...chord, ...extra })).toBe(false);
  });
});
describe("toolbar click routing", () => {
  function surface(
    sendResult: () => Promise<unknown> = () => Promise.resolve(),
  ) {
    const sent: Array<{ tabId: number; message: unknown; options: unknown }> =
      [];
    const notebooks: Array<{ windowId: number }> = [];
    return {
      sent,
      notebooks,
      deps: {
        sendToTab(tabId: number, message: unknown, options: unknown) {
          sent.push({ tabId, message, options });
          return sendResult();
        },
        openNotebook(input: { windowId: number }) {
          notebooks.push(input);
          return Promise.resolve();
        },
      },
    };
  }
  const youtube = {
    id: 4,
    windowId: 7,
    active: true,
    url: "https://www.youtube.com/watch?v=abcdefghijk",
  } as chrome.tabs.Tab;
  it("asks only the top frame of a supported YouTube watch tab to toggle the in-page panel", async () => {
    const { sent, notebooks, deps } = surface();
    await handleToolbarClick(youtube, deps);
    expect(sent).toEqual([
      {
        tabId: 4,
        message: { version: 1, op: "panel.toggle" },
        options: { frameId: 0 },
      },
    ]);
    expect(notebooks).toEqual([]);
  });
  it.each([
    { url: "https://www.youtube.com/" },
    { url: "https://www.youtube.com/shorts/abcdefghijk" },
    { url: "https://evil.test/watch?v=abcdefghijk" },
    { url: "https://www.youtube.com.evil.test/watch?v=abcdefghijk" },
    { url: "chrome://extensions" },
    { url: undefined },
  ])(
    "opens the notebook in the same window for an unsupported surface: %j",
    async (override) => {
      const { sent, notebooks, deps } = surface();
      await handleToolbarClick({ ...youtube, ...override }, deps);
      expect(sent).toEqual([]);
      expect(notebooks).toEqual([{ windowId: 7 }]);
    },
  );
  it("falls back to the notebook when the tab has no content script to toggle (page loaded before install/update)", async () => {
    const { sent, notebooks, deps } = surface(() =>
      Promise.reject(new Error("Receiving end does not exist")),
    );
    await handleToolbarClick(youtube, deps);
    expect(sent).toHaveLength(1);
    expect(notebooks).toEqual([{ windowId: 7 }]);
  });
  it("reports a failure instead of guessing when the clicked tab has no window", async () => {
    const { sent, notebooks, deps } = surface();
    await expect(
      handleToolbarClick({ ...youtube, windowId: undefined as never }, deps),
    ).rejects.toMatchObject({ code: "PLAYER_UNAVAILABLE" });
    expect(sent).toEqual([]);
    expect(notebooks).toEqual([]);
  });
});
it("recognizes Option+N by physical key even when macOS reports Dead, without stealing composition or text entry", () => {
  expect(
    shouldStartQuickNote(key({ key: "Dead", code: "KeyN", altKey: true }), []),
  ).toBe(true);
  for (const override of [
    { altKey: false },
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { isComposing: true },
    { repeat: true },
    { keyCode: 229 },
    { code: "KeyM" },
  ])
    expect(
      shouldStartQuickNote(
        key({ key: "Dead", code: "KeyN", altKey: true, ...override }),
        [],
      ),
    ).toBe(false);
  const dom = new JSDOM("<textarea></textarea>");
  expect(
    shouldStartQuickNote(key({ altKey: true }), [
      dom.window.document.querySelector("textarea")!,
    ]),
  ).toBe(false);
  dom.window.close();
});
