import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (reply: unknown) => void,
) => boolean | void;
let dom: JSDOM | undefined;
afterEach(() => {
  dom?.window.dispatchEvent(new dom.window.Event("pagehide"));
  dom?.window.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("toolbar opening focuses the in-page frame before the worker reply, and closing/reopening retains it", async () => {
  dom = new JSDOM('<main id="lesson">YouTube lesson</main>', {
    url: "https://www.youtube.com/watch?v=abcdefghijk",
  });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("location", dom.window.location);
  const extensionId = "abcdefghijklmnopabcdefghijklmnop";
  const listeners: RuntimeListener[] = [];
  let resolveOpen: ((value: unknown) => void) | undefined;
  vi.stubGlobal("chrome", {
    runtime: {
      id: extensionId,
      getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onMessage: {
        addListener(listener: RuntimeListener) {
          listeners.push(listener);
        },
        removeListener() {},
      },
      sendMessage(message: { op: string }) {
        if (message.op === "panel.open")
          return new Promise((resolve) => {
            resolveOpen = resolve;
          });
        return Promise.resolve({ ok: true });
      },
    },
  });
  const roots: ShadowRoot[] = [];
  const attach = dom.window.Element.prototype.attachShadow;
  vi.spyOn(dom.window.Element.prototype, "attachShadow").mockImplementation(
    function (this: Element, options) {
      const root = attach.call(this, options);
      roots.push(root);
      return root;
    },
  );
  // Exercise the content entry's module-load boundary after installing its Chrome/DOM globals.
  await import("../src/content/index");
  const toggle = () => {
    for (const listener of listeners)
      listener(
        { version: 1, op: "panel.toggle" },
        { id: extensionId },
        () => {},
      );
  };
  toggle();
  expect(roots).toHaveLength(1);
  const frame = roots[0].querySelector("iframe")!;
  expect(frame).not.toBeNull();
  expect(roots[0].activeElement).toBe(frame);
  expect(document.querySelector("#lesson")?.textContent).toBe("YouTube lesson");
  expect(resolveOpen).toBeTypeOf("function");
  toggle();
  toggle();
  expect(roots).toHaveLength(1);
  expect(roots[0].querySelector("iframe")).toBe(frame);
  expect(roots[0].activeElement).toBe(frame);
});
