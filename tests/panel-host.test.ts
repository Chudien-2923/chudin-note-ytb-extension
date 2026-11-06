import { setImmediate } from "node:timers/promises";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { JSDOM } from "jsdom";
import { createPanelHost, type PanelHost } from "../src/content/panel-host";
import { startPanelFrame } from "../src/panel/frame";
import { attachPanel, createClient, type Client } from "../src/ui/client";
import { AppError } from "../src/domain/types";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const frameOrigin = `chrome-extension://${extensionId}`;
const frameUrl = `${frameOrigin}/sidepanel.html`;
const youtube = "https://www.youtube.com";
const token = "secret-token-8f31c2d94b7a4e5f";
const channel = "chudin-note-panel";
const session = { windowId: 4, session: token };

async function until(check: () => boolean) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await setImmediate();
  }
  throw Error("Condition did not settle");
}

function deliver(
  win: Window,
  source: unknown,
  origin: string,
  data: unknown,
): void {
  const event = new (win as unknown as typeof globalThis).MessageEvent(
    "message",
    { data, origin },
  );
  Object.defineProperty(event, "source", { value: source });
  win.dispatchEvent(event);
}

type Sent = [message: unknown, targetOrigin: unknown];
function record(win: object): Sent[] {
  const sent: Sent[] = [];
  Object.defineProperty(win, "postMessage", {
    configurable: true,
    value: (message: unknown, targetOrigin: unknown) => {
      sent.push([message, targetOrigin]);
    },
  });
  return sent;
}

describe("in-page panel host", () => {
  let dom: JSDOM;
  let doc: Document;
  let shadows: ShadowRoot[];
  let shadowModes: string[];
  let host: PanelHost;
  let reconnects: number;
  let quickNotes: number;
  let pageMessages: unknown[];
  let pagePosts: Sent[];
  let frameDoms: JSDOM[];

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html style="margin-right: 3px; color: red"><head></head><body><div id="app"></div></body></html>',
      { url: `${youtube}/watch?v=abcdefghijk` },
    );
    doc = dom.window.document;
    shadows = [];
    frameDoms = [];
    shadowModes = [];
    const original = dom.window.Element.prototype.attachShadow;
    dom.window.Element.prototype.attachShadow = function (
      this: Element,
      init: ShadowRootInit,
    ) {
      const root = original.call(this, init);
      shadows.push(root);
      shadowModes.push(init.mode);
      return root;
    };
    reconnects = 0;
    quickNotes = 0;
    pageMessages = [];
    dom.window.addEventListener("message", (event) => {
      pageMessages.push(event.data);
    });
    pagePosts = record(dom.window);
    host = createPanelHost(doc, {
      frameUrl,
      onReconnect: () => {
        reconnects++;
      },
      onQuickNote: () => {
        quickNotes++;
      },
    });
  });
  afterEach(() => {
    host.dispose();
    for (const frameDom of frameDoms) frameDom.window.close();
    dom.window.close();
  });
  const iframe = (index = 0) => {
    const frame = shadows[index].querySelector("iframe") as HTMLIFrameElement;
    // jsdom does not create browsing contexts for shadow-root iframes.
    // Supply only that browser boundary; host routing/focus/lifecycle stay real.
    if (!frame.contentWindow) {
      const frameDom = new JSDOM("", { url: frameUrl });
      frameDoms.push(frameDom);
      frameDom.window.focus = () => {};
      Object.defineProperty(frame, "contentWindow", { value: frameDom.window });
    }
    return frame;
  };
  const frameWindow = () => iframe().contentWindow as Window;
  const hello = { channel, version: 1, type: "ready" };
  const fromFrame = (data: unknown = hello, origin = frameOrigin) =>
    deliver(dom.window as unknown as Window, frameWindow(), origin, data);
  const hostElement = () => shadows[0].host as HTMLElement;

  it("creates nothing until the first open, then appends one closed-shadow host without touching existing nodes", () => {
    const before = Array.from(doc.documentElement.children);
    expect(shadows).toHaveLength(0);
    expect(Array.from(doc.documentElement.children)).toEqual(before);
    host.open();
    expect(shadowModes).toEqual(["closed"]);
    expect(Array.from(doc.documentElement.children)).toEqual([
      ...before,
      hostElement(),
    ]);
    expect(doc.querySelectorAll("iframe")).toHaveLength(0);
    for (const el of doc.querySelectorAll("*"))
      expect(el.shadowRoot).toBeNull();
    expect(iframe().getAttribute("src")).toBe(frameUrl);
    expect(host.isOpen()).toBe(true);
  });

  it("focuses the extension frame synchronously inside the opening call", () => {
    host.open();
    expect(shadows[0].activeElement).toBe(iframe());
  });

  it("keeps the same frame across hide and reopen and refocuses it", () => {
    host.open();
    const frame = iframe();
    const win = frame.contentWindow;
    const children = doc.documentElement.children.length;
    host.hide();
    expect(host.isOpen()).toBe(false);
    expect(hostElement().style.display).toBe("none");
    expect(iframe()).toBe(frame);
    (doc.activeElement as HTMLElement | null)?.blur?.();
    host.open();
    expect(shadows).toHaveLength(1);
    expect(host.isOpen()).toBe(true);
    expect(hostElement().style.display).not.toBe("none");
    expect(iframe()).toBe(frame);
    expect(frame.contentWindow).toBe(win);
    expect(doc.documentElement.children.length).toBe(children);
    expect(shadows[0].activeElement).toBe(frame);
  });

  it("sends the session only to the frame window with the exact extension origin, after it is ready", () => {
    host.open();
    const sent = record(frameWindow());
    host.show(session);
    expect(sent).toEqual([]);
    fromFrame();
    expect(sent).toEqual([
      [
        { channel, version: 1, type: "session", session: token, windowId: 4 },
        frameOrigin,
      ],
    ]);
    expect(pagePosts).toEqual([]);
  });

  it("never exposes the token in page-visible DOM, frame URL, attributes or messages", () => {
    host.open();
    record(frameWindow());
    host.show(session);
    fromFrame();
    expect(doc.documentElement.outerHTML).not.toContain(token);
    expect(shadows[0].innerHTML).not.toContain(token);
    expect(iframe().outerHTML).not.toContain(token);
    expect(JSON.stringify(pagePosts)).not.toContain(token);
    expect(JSON.stringify(pageMessages)).not.toContain(token);
  });

  it("delivers immediately when the frame was ready before the session arrived, without asking to reconnect", () => {
    host.open();
    const sent = record(frameWindow());
    fromFrame();
    expect(reconnects).toBe(0);
    expect(sent).toEqual([]);
    host.show(session);
    expect(sent).toHaveLength(1);
  });

  it.each([
    ["page main world as source", () => dom.window, frameOrigin, hello],
    [
      "a foreign window as source",
      () => new JSDOM("", { url: "https://evil.example/" }).window,
      frameOrigin,
      hello,
    ],
    [
      "the frame navigated to another origin",
      () => frameWindow(),
      youtube,
      hello,
    ],
    [
      "another extension origin",
      () => frameWindow(),
      "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      hello,
    ],
    ["a null origin", () => frameWindow(), "null", hello],
    [
      "wrong channel",
      () => frameWindow(),
      frameOrigin,
      { ...hello, channel: "other" },
    ],
    [
      "wrong version",
      () => frameWindow(),
      frameOrigin,
      { ...hello, version: 2 },
    ],
    [
      "unknown type",
      () => frameWindow(),
      frameOrigin,
      { ...hello, type: "unknown-lifecycle" },
    ],
    ["string payload", () => frameWindow(), frameOrigin, "ready"],
    ["null payload", () => frameWindow(), frameOrigin, null],
  ])("ignores a lifecycle message with %s", (_name, source, origin, data) => {
    host.open();
    const sent = record(frameWindow());
    host.show(session);
    deliver(dom.window as unknown as Window, source(), origin, data);
    expect(sent).toEqual([]);
    expect(reconnects).toBe(0);
    fromFrame();
    expect(sent).toHaveLength(1);
  });

  it("does not let a stale frame from a disposed host handshake with a new host", () => {
    host.open();
    const stale = frameWindow();
    host.dispose();
    const next = createPanelHost(doc, {
      frameUrl,
      onReconnect: () => {
        reconnects++;
      },
    });
    try {
      next.open();
      const sent = record(iframe(1).contentWindow as Window);
      next.show(session);
      deliver(dom.window as unknown as Window, stale, frameOrigin, hello);
      deliver(dom.window as unknown as Window, stale, frameOrigin, {
        ...hello,
        type: "reconnect",
      });
      expect(sent).toEqual([]);
      expect(reconnects).toBe(0);
    } finally {
      next.dispose();
    }
  });

  it("ignores every message after dispose", () => {
    host.open();
    const win = frameWindow();
    const sent = record(win);
    host.show(session);
    host.dispose();
    deliver(dom.window as unknown as Window, win, frameOrigin, hello);
    deliver(dom.window as unknown as Window, win, frameOrigin, {
      ...hello,
      type: "reconnect",
    });
    expect(sent).toEqual([]);
    expect(reconnects).toBe(0);
  });

  it("asks the integration to reconnect when the frame reports it, and delivers the replacement without resending the old token", () => {
    host.open();
    const sent = record(frameWindow());
    host.show(session);
    fromFrame();
    fromFrame({ ...hello, type: "reconnect" });
    expect(reconnects).toBe(1);
    host.show({ windowId: 4, session: "second-session-token-0000" });
    expect(sent.map(([m]) => JSON.stringify(m))).toEqual([
      JSON.stringify({
        channel,
        version: 1,
        type: "session",
        session: token,
        windowId: 4,
      }),
      JSON.stringify({
        channel,
        version: 1,
        type: "session",
        session: "second-session-token-0000",
        windowId: 4,
      }),
    ]);
    expect(JSON.stringify(sent[0][1])).toBe(JSON.stringify(frameOrigin));
  });

  it("asks to reconnect on a reloaded frame document instead of replaying the delivered token", () => {
    host.open();
    const sent = record(frameWindow());
    host.show(session);
    fromFrame();
    fromFrame();
    expect(sent).toHaveLength(1);
    expect(reconnects).toBe(1);
  });

  it("reserves right-hand space only while visible and restores the exact previous inline style", () => {
    const html = doc.documentElement;
    html.style.setProperty("margin-right", "3px", "important");
    host.open();
    expect(html.style.marginRight).toBe("420px");
    expect(html.style.color).toBe("red");
    host.hide();
    expect(html.style.marginRight).toBe("3px");
    expect(html.style.getPropertyPriority("margin-right")).toBe("important");
    expect(html.style.color).toBe("red");
    host.open();
    expect(html.style.marginRight).toBe("420px");
    host.dispose();
    expect(html.style.marginRight).toBe("3px");
    expect(html.style.getPropertyPriority("margin-right")).toBe("important");
  });

  it("does not reserve more than the viewport and does not overwrite a style the page changed meanwhile", () => {
    Object.defineProperty(dom.window, "innerWidth", {
      configurable: true,
      value: 300,
    });
    host.open();
    expect(doc.documentElement.style.marginRight).toBe("300px");
    doc.documentElement.style.marginRight = "9px";
    host.hide();
    expect(doc.documentElement.style.marginRight).toBe("9px");
  });

  it("dispose removes the host, restores layout and is idempotent", () => {
    const before = Array.from(doc.documentElement.children);
    host.open();
    host.dispose();
    host.dispose();
    expect(Array.from(doc.documentElement.children)).toEqual(before);
    expect(doc.documentElement.style.marginRight).toBe("3px");
    expect(host.isOpen()).toBe(false);
  });

  it("closes through its own button, keeps the frame and restores layout", () => {
    host.open();
    const frame = iframe();
    const close = shadows[0].querySelector("button") as HTMLButtonElement;
    close.click();
    expect(host.isOpen()).toBe(false);
    expect(doc.documentElement.style.marginRight).toBe("3px");
    expect(iframe()).toBe(frame);
  });

  it("opens on show only when never opened or hidden, and still delivers the token after the user closed it", () => {
    host.show(session);
    expect(host.isOpen()).toBe(true);
    const sent = record(frameWindow());
    host.hide();
    host.show({ windowId: 4, session: "after-close-token-123456" });
    expect(host.isOpen()).toBe(false);
    fromFrame();
    expect(sent).toHaveLength(1);
    expect(host.isOpen()).toBe(false);
  });

  it("shows loading text without note data and replaces it with a safe error", () => {
    host.open();
    expect(shadows[0].textContent).toContain("Đang kết nối");
    host.showError('Mất kết nối <img src=x onerror="alert(1)">');
    expect(shadows[0].querySelector("img")).toBeNull();
    expect(shadows[0].textContent).toContain("Mất kết nối <img");
    expect(shadows[0].textContent).not.toContain("Đang kết nối…");
  });

  it("clears host status once the session has been handed to the frame", () => {
    host.open();
    record(frameWindow());
    host.showError("Lỗi mở panel");
    host.show(session);
    fromFrame();
    expect(shadows[0].textContent).not.toContain("Lỗi mở panel");
  });

  it("showError does not reopen a panel the user closed", () => {
    host.open();
    host.hide();
    host.showError("Lỗi");
    expect(host.isOpen()).toBe(false);
  });

  it("reports a quick-note request only from the visible frame it owns", () => {
    host.open();
    fromFrame({ ...hello, type: "quick" }, youtube);
    deliver(dom.window as unknown as Window, dom.window, frameOrigin, {
      ...hello,
      type: "quick",
    });
    expect(quickNotes).toBe(0);
    fromFrame({ ...hello, type: "quick" });
    expect(quickNotes).toBe(1);
    host.hide();
    fromFrame({ ...hello, type: "quick" });
    expect(quickNotes).toBe(1);
    expect(reconnects).toBe(0);
  });

  it("keeps the loaded frame while fullscreen and resize split the player beside it, then restores both layouts", async () => {
    const player = doc.createElement("div");
    player.id = "movie_player";
    const video = doc.createElement("video");
    player.append(video);
    doc.body.append(player);
    let full: Element | null = null;
    Object.defineProperty(doc, "fullscreenElement", { get: () => full });
    Object.defineProperties(dom.window, {
      innerWidth: { configurable: true, value: 1600 },
      innerHeight: { configurable: true, value: 900 },
    });
    // jsdom has no native top layer; only its presentation boundary is adapted.
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      togglePopover: {
        configurable: true,
        value() {
          return true;
        },
      },
      hidePopover: { configurable: true, value() {} },
    });
    host.open();
    const frame = iframe();
    const frameDoc = frame.contentDocument;
    const originalParent = frame.parentNode;
    full = player;
    doc.dispatchEvent(new dom.window.Event("fullscreenchange"));
    expect(dom.window.getComputedStyle(video).width).toBe("1180px");
    expect(hostElement().style.width).toBe("420px");
    expect(doc.documentElement.style.marginRight).toBe("3px");
    expect(hostElement().getAttribute("popover")).toBe("manual");
    Object.defineProperties(dom.window, {
      innerWidth: { value: 640 },
      innerHeight: { value: 480 },
    });
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    expect(dom.window.getComputedStyle(video).width).toBe("320px");
    expect(hostElement().style.width).toBe("320px");
    full = null;
    doc.dispatchEvent(new dom.window.Event("fullscreenchange"));
    expect(hostElement().hasAttribute("popover")).toBe(false);
    expect(player.hasAttribute("data-chudin-note-split")).toBe(false);
    expect(doc.documentElement.style.marginRight).toBe("420px");
    expect(iframe() === frame).toBe(true);
    expect(frame.contentDocument === frameDoc).toBe(true);
    expect(frame.parentNode === originalParent).toBe(true);
    host.hide();
    expect(doc.documentElement.style.marginRight).toBe("3px");
    // A hidden host must not resize the player or reserve page space on later events.
    full = player;
    doc.dispatchEvent(new dom.window.Event("fullscreenchange"));
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    expect(player.hasAttribute("data-chudin-note-split")).toBe(false);
    expect(doc.documentElement.style.marginRight).toBe("3px");
  });

  it("follows YouTube fullscreen class changes without requiring a native fullscreen event", async () => {
    const player = doc.createElement("div");
    player.id = "movie_player";
    const video = doc.createElement("video");
    player.append(video);
    doc.body.append(player);
    Object.defineProperties(dom.window, {
      innerWidth: { configurable: true, value: 1600 },
      innerHeight: { configurable: true, value: 900 },
    });
    host.open();
    const frame = iframe();
    player.classList.add("ytp-fullscreen");
    await until(() => dom.window.getComputedStyle(video).width === "1180px");
    player.classList.remove("ytp-fullscreen");
    await until(() => !player.hasAttribute("data-chudin-note-split"));
    expect(iframe() === frame).toBe(true);
    expect(doc.documentElement.style.marginRight).toBe("420px");
  });
});

describe("close shortcut across the existing frame and host", () => {
  it("hides from the textarea, ignores IME/repeat, and retains the same frame and text for reopening", async () => {
    const page = new JSDOM("<main></main>", {
      url: `${youtube}/watch?v=abcdefghijk`,
    });
    const frame = new JSDOM("<main></main>", { url: frameUrl });
    const doc = page.window.document;
    let shadow: ShadowRoot | undefined;
    const attachShadow = page.window.Element.prototype.attachShadow;
    page.window.Element.prototype.attachShadow = function (
      this: Element,
      init: ShadowRootInit,
    ) {
      shadow = attachShadow.call(this, init);
      return shadow;
    };
    frame.window.focus = () => {};
    const host = createPanelHost(doc, { frameUrl, onReconnect() {} });
    host.open();
    const iframe = shadow!.querySelector("iframe")!;
    // Adapt only jsdom's missing shadow-iframe browsing context and cross-window transport.
    Object.defineProperty(iframe, "contentWindow", { value: frame.window });
    Object.defineProperty(frame.window, "parent", { value: page.window });
    page.window.postMessage = (
      message: unknown,
      targetOrigin?: string | WindowPostMessageOptions,
    ) => {
      expect(targetOrigin).toBe(youtube);
      deliver(
        page.window as unknown as Window,
        frame.window,
        frameOrigin,
        message,
      );
    };
    const root = frame.window.document.querySelector<HTMLElement>("main")!;
    const mounted = startPanelFrame({
      window: frame.window as unknown as Window,
      root,
      async attach() {
        return { windowId: 4 };
      },
      createClient: () => ({
        async call() {
          throw Error("Closing must not mutate notes");
        },
        subscribe: () => () => {},
      }),
      mount(target) {
        const textarea = target.ownerDocument.createElement("textarea");
        target.append(textarea);
        return { refresh() {}, dispose() {} };
      },
    });
    deliver(frame.window as unknown as Window, page.window, youtube, {
      channel,
      version: 1,
      type: "session",
      ...session,
    });
    await until(() => root.querySelector("textarea") !== null);
    const textarea = root.querySelector("textarea")!;
    textarea.value = "Nháp vẫn phải còn khi đóng";
    textarea.focus();
    const press = (extra: KeyboardEventInit = {}) => {
      const event = new frame.window.KeyboardEvent("keydown", {
        code: "KeyN",
        key: "Dead",
        altKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      textarea.dispatchEvent(event);
      return event;
    };
    try {
      for (const extra of [
        { isComposing: true },
        { keyCode: 229 },
        { repeat: true },
        { shiftKey: true },
      ]) {
        expect(press(extra).defaultPrevented).toBe(false);
        expect(host.isOpen()).toBe(true);
      }
      const forged = { channel, version: 1, type: "close" };
      deliver(
        page.window as unknown as Window,
        page.window,
        frameOrigin,
        forged,
      );
      deliver(page.window as unknown as Window, frame.window, youtube, forged);
      expect(host.isOpen()).toBe(true);
      expect(press().defaultPrevented).toBe(true);
      expect(host.isOpen()).toBe(false);
      expect(doc.documentElement.style.marginRight).toBe("");
      expect(textarea.value).toBe("Nháp vẫn phải còn khi đóng");
      press();
      expect(host.isOpen()).toBe(false);
      host.open();
      expect(shadow!.querySelector("iframe") === iframe).toBe(true);
      expect(root.querySelector("textarea") === textarea).toBe(true);
      expect(textarea.value).toBe("Nháp vẫn phải còn khi đóng");
    } finally {
      mounted.dispose();
      host.dispose();
      frame.window.close();
      page.window.close();
    }
  });
});

describe("panel frame bootstrap", () => {
  let outer: JSDOM;
  let win: Window;
  let root: HTMLElement;
  let toParent: Sent[];
  let attach: Mock<(session: string) => Promise<{ windowId: number }>>;
  let mount: Mock<
    (
      target: HTMLElement,
      client: Client,
      init: { windowId: number },
    ) => { refresh(windowId: number): void; dispose(): void }
  >;
  let auths: Array<{ session(): string | undefined; onAuthFailure(): void }>;
  let disposed: number;
  let stop: { dispose(): void } | undefined;
  const fakeClient: Client = {
    async call() {
      throw Error("unused");
    },
    subscribe: () => () => {},
  };
  const reconnectCount = () =>
    toParent.filter(([m]) => JSON.stringify(m).includes('"type":"reconnect"'))
      .length;
  const offer = (
    value: string,
    windowId = 4,
    origin = youtube,
    source: unknown = win.parent,
    data: unknown = undefined,
  ) =>
    deliver(
      win,
      source,
      origin,
      data ?? {
        channel,
        version: 1,
        type: "session",
        session: value,
        windowId,
      },
    );

  beforeEach(() => {
    outer = new JSDOM("<!doctype html><body><iframe></iframe></body>", {
      url: `${youtube}/watch?v=abcdefghijk`,
    });
    win = outer.window.document.querySelector("iframe")!
      .contentWindow as Window;
    root = win.document.createElement("main");
    win.document.body.append(root);
    toParent = record(win.parent);
    attach = vi.fn(async (_s: string) => ({ windowId: 4 }));
    auths = [];
    disposed = 0;
    mount = vi.fn(
      (target: HTMLElement, _client: Client, _init: { windowId: number }) => {
        const editor = target.ownerDocument.createElement("textarea");
        editor.id = "editor";
        editor.value = "draft";
        target.append(editor);
        return {
          refresh() {},
          dispose() {
            disposed++;
          },
        };
      },
    );
    stop = startPanelFrame({
      window: win,
      root,
      attach,
      createClient: (auth) => {
        auths.push(auth);
        return fakeClient;
      },
      mount,
    });
  });
  afterEach(() => {
    stop?.dispose();
    outer.window.close();
  });

  it("announces itself to the exact parent origin and shows no notes or controls before authentication", () => {
    expect(toParent).toEqual([
      [{ channel, version: 1, type: "ready" }, youtube],
    ]);
    expect(root.querySelector("button, select, textarea, a")).toBeNull();
    expect(mount).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign origin", "https://evil.example", () => win.parent],
    ["sibling subdomain", "https://m.youtube.com", () => win.parent],
    ["its own origin", frameOrigin, () => win.parent],
    ["a non-parent window", youtube, () => win],
    [
      "an unrelated window",
      youtube,
      () => new JSDOM("", { url: `${youtube}/` }).window,
    ],
  ])("ignores a session offered by %s", async (_name, origin, source) => {
    offer(token, 4, origin, source());
    for (let i = 0; i < 20; i++) await setImmediate();
    expect(attach).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
  });

  it.each([
    [
      "wrong channel",
      {
        channel: "x",
        version: 1,
        type: "session",
        session: token,
        windowId: 4,
      },
    ],
    [
      "wrong version",
      { channel, version: 2, type: "session", session: token, windowId: 4 },
    ],
    [
      "empty token",
      { channel, version: 1, type: "session", session: "", windowId: 4 },
    ],
    [
      "non-string token",
      { channel, version: 1, type: "session", session: 7, windowId: 4 },
    ],
    [
      "fractional window",
      { channel, version: 1, type: "session", session: token, windowId: 1.5 },
    ],
    [
      "missing window",
      { channel, version: 1, type: "session", session: token },
    ],
    ["other type", { channel, version: 1, type: "ready" }],
  ])("ignores a malformed session message: %s", async (_name, data) => {
    offer(token, 4, youtube, win.parent, data);
    for (let i = 0; i < 20; i++) await setImmediate();
    expect(attach).not.toHaveBeenCalled();
  });

  it("attaches with the offered token, mounts once with the worker-confirmed window and uses the token for RPCs", async () => {
    offer(token);
    await until(() => mount.mock.calls.length === 1);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(token);
    expect(mount.mock.calls[0][2]).toEqual({ windowId: 4 });
    expect(auths[0].session()).toBe(token);
    expect(root.innerHTML).not.toContain(token);
    expect(win.document.documentElement.outerHTML).not.toContain(token);
  });

  it("does not trust the offered window id when the worker attaches another one", async () => {
    attach.mockResolvedValueOnce({ windowId: 5 });
    offer(token, 4);
    await until(() => reconnectCount() === 1);
    expect(mount).not.toHaveBeenCalled();
    expect(auths.length === 0 || auths[0].session() !== token).toBe(true);
  });

  it("reauthenticates without remounting or dropping the local editor, and requests reconnect once", async () => {
    offer(token);
    await until(() => mount.mock.calls.length === 1);
    const editor = root.querySelector("textarea")!;
    editor.value = "typing in progress";
    auths[0].onAuthFailure();
    auths[0].onAuthFailure();
    expect(reconnectCount()).toBe(1);
    expect(root.querySelector("textarea")).toBe(editor);
    offer("replacement-token-000000", 4);
    await until(() => attach.mock.calls.length === 2);
    await until(() => auths[0].session() === "replacement-token-000000");
    expect(mount).toHaveBeenCalledTimes(1);
    expect(disposed).toBe(0);
    expect(root.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("typing in progress");
  });

  it("rejects an unverified replacement without dropping current authority or input", async () => {
    offer(token);
    await until(() => mount.mock.calls.length === 1);
    const editor = root.querySelector("textarea")!;
    editor.value = "Keep this draft";
    attach.mockRejectedValueOnce(new AppError("UNAUTHORIZED", "forged"));
    offer("page-forged-token-000000");
    await until(() => attach.mock.calls.length === 2);
    for (let i = 0; i < 5; i++) await setImmediate();
    expect(auths[0].session()).toBe(token);
    expect(root.querySelector("textarea") === editor).toBe(true);
    expect(editor.value).toBe("Keep this draft");
  });

  it("keeps the mounted editor and asks to reconnect when reattachment is rejected", async () => {
    offer(token);
    await until(() => mount.mock.calls.length === 1);
    const editor = root.querySelector("textarea")!;
    auths[0].onAuthFailure();
    attach.mockRejectedValueOnce(new AppError("UNAUTHORIZED", "no"));
    offer("rejected-token-0000000");
    await until(() => reconnectCount() === 2);
    expect(root.querySelector("textarea")).toBe(editor);
    expect(mount).toHaveBeenCalledTimes(1);
    offer("good-token-000000000000");
    await until(() => auths[0].session() === "good-token-000000000000");
  });

  it("recovers from a rejected first attach on the next session without mounting early", async () => {
    attach.mockRejectedValueOnce(new AppError("STALE_CONTEXT", "old"));
    offer("expired-token-00000000");
    await until(() => reconnectCount() === 1);
    expect(mount).not.toHaveBeenCalled();
    offer(token);
    await until(() => mount.mock.calls.length === 1);
  });

  it("stops requesting reconnects after repeated failures but still accepts a later valid session", async () => {
    attach.mockRejectedValue(new AppError("STALE_CONTEXT", "old"));
    for (let i = 0; i < 6; i++) {
      offer(`bad-token-${i}-0000000000`);
      await until(() => attach.mock.calls.length === i + 1);
      for (let j = 0; j < 5; j++) await setImmediate();
    }
    expect(reconnectCount()).toBeGreaterThanOrEqual(1);
    expect(reconnectCount()).toBeLessThanOrEqual(3);
    attach.mockResolvedValue({ windowId: 4 });
    offer(token);
    await until(() => mount.mock.calls.length === 1);
  });

  it("stops listening and unmounts on dispose", async () => {
    offer(token);
    await until(() => mount.mock.calls.length === 1);
    stop!.dispose();
    stop = undefined;
    expect(disposed).toBe(1);
    auths[0].onAuthFailure();
    offer("after-dispose-token-0000");
    for (let i = 0; i < 20; i++) await setImmediate();
    expect(attach).toHaveBeenCalledTimes(1);
  });

  describe("quick-note shortcut from inside the frame", () => {
    const quickCount = () =>
      toParent.filter(([m]) => JSON.stringify(m).includes('"type":"quick"'))
        .length;
    const press = (target: Element, init: KeyboardEventInit) => {
      const event = new (win as unknown as typeof globalThis).KeyboardEvent(
        "keydown",
        { bubbles: true, cancelable: true, composed: true, ...init },
      );
      target.dispatchEvent(event);
      return event;
    };
    const optionN = { code: "KeyN", key: "˜", altKey: true };
    async function authenticate() {
      offer(token);
      await until(() => mount.mock.calls.length === 1);
      const fresh = win.document.createElement("button");
      root.append(fresh);
      return fresh;
    }

    it("reports Option+N pressed on a non-editable control and keeps the key from the frame", async () => {
      const fresh = await authenticate();
      const event = press(fresh, optionN);
      expect(quickCount()).toBe(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it.each([
      ["inside the editor", () => root.querySelector("textarea")!, optionN],
      [
        "during IME composition",
        () => root.querySelector("button")!,
        { ...optionN, isComposing: true },
      ],
      [
        "without Option",
        () => root.querySelector("button")!,
        { code: "KeyN", key: "n" },
      ],
      [
        "as a repeat",
        () => root.querySelector("button")!,
        { ...optionN, repeat: true },
      ],
    ])("does not report Option+N %s", async (_name, target, init) => {
      await authenticate();
      press(target(), init);
      expect(quickCount()).toBe(0);
    });

    it("reports nothing before the frame is authenticated", () => {
      press(win.document.body, optionN);
      expect(quickCount()).toBe(0);
    });
  });
});

describe("panel client authority", () => {
  const send = vi.fn();
  const reply = (
    message: { requestId: string; op: string },
    result: unknown,
    error?: { code: string; message: string },
  ) => ({
    version: 1,
    requestId: message.requestId,
    op: message.op,
    ok: !error,
    ...(error ? { error } : { result }),
  });
  beforeEach(() => {
    send.mockReset();
    Object.assign(globalThis, {
      chrome: { runtime: { sendMessage: send, id: extensionId } },
    });
  });

  it("uses the replaced token on later calls", async () => {
    let current: string | undefined = "first-token";
    send.mockImplementation(async (m) => reply(m, []));
    const client = createClient({
      session: () => current,
      onAuthFailure() {},
    });
    await client.call("listNotebooks", {});
    current = "second-token";
    await client.call("listNotebooks", {});
    expect(send.mock.calls[0][0].panelSession).toBe("first-token");
    expect(send.mock.calls[1][0].panelSession).toBe("second-token");
  });

  it("reports a rejected panel session once, explains it, and never retries a mutation", async () => {
    send.mockImplementation(async (m) =>
      reply(m, undefined, { code: "UNAUTHORIZED", message: "worker words" }),
    );
    const lost = vi.fn();
    const client = createClient({
      session: () => "token",
      onAuthFailure: lost,
    });
    await expect(
      client.call("createNotebook", { name: "Học" }),
    ).rejects.toSatisfy(
      (e: AppError) =>
        e.code === "UNAUTHORIZED" &&
        e.message.includes("hết hạn") &&
        e.message.includes("Nội dung đang nhập vẫn được giữ"),
    );
    expect(lost).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(["STALE_CONTEXT", "NOT_FOUND", "CONFLICT"])(
    "does not treat %s as lost authority",
    async (code) => {
      send.mockImplementation(async (m) =>
        reply(m, undefined, { code, message: "worker words" }),
      );
      const lost = vi.fn();
      const client = createClient({ session: () => "t", onAuthFailure: lost });
      await expect(client.call("listNotebooks", {})).rejects.toMatchObject({
        code,
        message: "worker words",
      });
      expect(lost).not.toHaveBeenCalled();
    },
  );

  it("does not treat transport loss as lost authority", async () => {
    const lost = vi.fn();
    const client = createClient({ session: () => "t", onAuthFailure: lost });
    send.mockRejectedValueOnce(Error("Extension context invalidated"));
    await expect(client.call("listNotebooks", {})).rejects.toMatchObject({
      code: "PLAYER_UNAVAILABLE",
    });
    expect(lost).not.toHaveBeenCalled();
  });

  it("attaches by presenting the token and returns only a valid window id", async () => {
    send.mockImplementation(async (m) => reply(m, { windowId: 4 }));
    await expect(attachPanel(token)).resolves.toEqual({ windowId: 4 });
    expect(send.mock.calls[0][0]).toMatchObject({
      version: 1,
      op: "panel.attach",
      panelSession: token,
    });
    send.mockImplementation(async (m) => reply(m, { windowId: "4" }));
    await expect(attachPanel(token)).rejects.toBeInstanceOf(AppError);
    send.mockImplementation(async (m) =>
      reply(m, undefined, { code: "UNAUTHORIZED", message: "no" }),
    );
    await expect(attachPanel(token)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
