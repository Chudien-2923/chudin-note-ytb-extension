import "fake-indexeddb/auto";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { startPanelFrame } from "../src/panel/frame";
import { mountPanel } from "../src/panel/controller";
import { openDatabase } from "../src/storage/database";
import { createRepository, type Repository } from "../src/storage/repository";
import { AppError, type PlayerSnapshot } from "../src/domain/types";
import type { Client } from "../src/ui/client";
import type { CommandMap } from "../src/shared/protocol";

async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 2000; i++) {
    if (await check()) return;
    await setImmediate();
  }
  throw Error("Panel recovery did not settle");
}

it.each([1, 9])(
  "a verified replacement grant in window %i refreshes the existing editor without dropping input",
  async (nextWindow) => {
    const db = await openDatabase(indexedDB, crypto.randomUUID());
    const repo = createRepository(db, {
      now: () => new Date().toISOString(),
      newId: () => crypto.randomUUID(),
    });
    const book = await repo.createNotebook({ name: "Học" });
    const video = await repo.assignVideo({
      notebookId: book.id,
      videoId: "abcdefghijk",
      title: "Lesson",
    });
    const dom = new JSDOM('<main id="app"></main>', {
      url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/sidepanel.html",
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
    });
    const root = document.querySelector<HTMLElement>("#app")!;
    let currentWindow = 1;
    let title = "Lesson";
    let pending = true;
    const snapshot = (): PlayerSnapshot => ({
      videoId: video.videoId,
      title,
      status: "ready",
      currentTime: 83,
      duration: 200,
      seekable: [{ start: 0, end: 200 }],
      binding: {
        videoId: video.videoId,
        tabId: 2,
        windowId: currentWindow,
        documentId: "top",
        documentToken: "token",
        generation: 1,
      },
    });
    const client: Client = {
      async call<K extends keyof CommandMap>(
        op: K,
        input: CommandMap[K]["input"],
      ): Promise<CommandMap[K]["output"]> {
        let result: unknown;
        if (
          op === "getPanelContext" ||
          op === "peekQuickNote" ||
          op === "ackQuickNote"
        ) {
          const payload = input as { windowId: number };
          if (payload.windowId !== currentWindow)
            throw new AppError("UNAUTHORIZED", "Wrong window");
        }
        if (op === "getPanelContext")
          result = {
            windowId: currentWindow,
            tabId: 2,
            videoId: video.videoId,
            binding: snapshot().binding,
            player: snapshot(),
            status: "ready",
            notebooks: await repo.listNotebooks(),
            data: await repo.readVideo({ videoId: video.videoId }),
          };
        else if (op === "peekQuickNote")
          result = pending
            ? {
                id: "quick",
                snapshot: snapshot(),
                expiresAt: Date.now() + 60000,
              }
            : null;
        else if (op === "ackQuickNote") {
          pending = false;
          result = undefined;
        } else if (op === "capturePlayer") result = snapshot();
        else if (op in repo) {
          const method = repo[op as keyof Repository] as (
            input: unknown,
          ) => Promise<unknown>;
          result = await method(input);
        } else throw Error(op);
        return result as CommandMap[K]["output"];
      },
      subscribe() {
        return () => {};
      },
    };
    const frame = startPanelFrame({
      window: dom.window as unknown as Window,
      root,
      async attach(token) {
        if (token !== "initial" && token !== "replacement")
          throw new AppError("UNAUTHORIZED", "Invalid grant");
        return { windowId: currentWindow };
      },
      createClient: () => client,
      mount: mountPanel,
    });
    function offer(session: string) {
      const event = new dom.window.MessageEvent("message", {
        origin: "https://www.youtube.com",
        data: {
          channel: "chudin-note-panel",
          version: 1,
          type: "session",
          session,
          windowId: currentWindow,
        },
      });
      Object.defineProperty(event, "source", { value: dom.window.parent });
      dom.window.dispatchEvent(event);
    }
    try {
      offer("initial");
      await until(
        () =>
          document.querySelector<HTMLTextAreaElement>("textarea")?.readOnly ===
            false && !pending,
      );
      const textarea = document.querySelector("textarea")!;
      textarea.value = "Chữ chưa được lưu thành note";
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      await until(
        async () =>
          (await repo.readVideo({ videoId: video.videoId })).drafts[0]?.text ===
          textarea.value,
      );
      currentWindow = nextWindow;
      title = "Recovered lesson";
      // Replacement attach must refresh itself; it cannot rely on an earlier invalidation.
      offer("replacement");
      await until(
        () => root.querySelector("h1")?.textContent === "Recovered lesson",
      );
      expect(root.querySelector("textarea") === textarea).toBe(true);
      expect(textarea.value).toBe("Chữ chưa được lưu thành note");
      expect(
        (await repo.readVideo({ videoId: video.videoId })).drafts[0]
          .timestampSeconds,
      ).toBe(63);
      expect((await repo.readVideo({ videoId: video.videoId })).notes).toEqual(
        [],
      );
    } finally {
      frame.dispose();
      dom.window.close();
      db.close();
      indexedDB.deleteDatabase(db.name);
    }
  },
);
