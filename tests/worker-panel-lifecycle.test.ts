import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import type { Reply } from "../src/shared/protocol";

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (reply: Reply) => void,
) => boolean | void;
function event<T>() {
  const listeners: T[] = [];
  return {
    listeners,
    addListener(listener: T) {
      listeners.push(listener);
    },
  };
}
it("a tab loading notification without a changed top document cannot revoke a live editor write", async () => {
  const id = "abcdefghijklmnopabcdefghijklmnop";
  const messages = event<MessageListener>();
  const updates =
    event<(tabId: number, change: chrome.tabs.OnUpdatedInfo) => void>();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("chrome", {
    runtime: { id, onMessage: messages, async sendMessage() {} },
    action: { onClicked: event<unknown>() },
    tabs: {
      onUpdated: updates,
      onRemoved: event<unknown>(),
      onActivated: event<unknown>(),
    },
    windows: {},
  });
  // Intentionally exercise worker entry module registration after installing Chrome/IDB boundaries.
  await import("../src/background/index");
  const tab = {
    id: 4,
    windowId: 7,
    active: true,
    url: "https://www.youtube.com/watch?v=abcdefghijk",
  } as chrome.tabs.Tab;
  const host: chrome.runtime.MessageSender = {
    id,
    frameId: 0,
    documentId: "same-top-document",
    url: tab.url,
    tab,
  };
  const frame: chrome.runtime.MessageSender = {
    id,
    frameId: 2,
    documentId: "editor-frame",
    url: `chrome-extension://${id}/sidepanel.html`,
    origin: `chrome-extension://${id}`,
    tab,
  };
  const notebook: chrome.runtime.MessageSender = {
    id,
    url: `chrome-extension://${id}/notebook.html`,
  };
  let sequence = 0;
  async function request(
    op: string,
    sender: chrome.runtime.MessageSender,
    payload?: unknown,
    panelSession?: string,
  ): Promise<Reply> {
    return new Promise((resolve) => {
      for (const listener of messages.listeners)
        listener(
          {
            version: 1,
            requestId: `r${++sequence}`,
            op,
            payload,
            panelSession,
          },
          sender,
          resolve,
        );
    });
  }
  try {
    const opened = await request("panel.open", host);
    expect(opened.ok).toBe(true);
    const { session } = opened.result as { session: string };
    expect((await request("panel.attach", frame, undefined, session)).ok).toBe(
      true,
    );
    for (const listener of updates.listeners)
      listener(4, { status: "loading" });
    const created = await request(
      "createNotebook",
      frame,
      { name: "Không mất quyền giữa lúc nhập" },
      session,
    );
    expect(created.ok).toBe(true);
    const listed = await request("listNotebooks", notebook, {});
    expect(listed.result).toMatchObject([
      { name: "Không mất quyền giữa lúc nhập" },
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
