import { describe, it, expect } from "vitest";
import {
  parseVideoId,
  formatTimestamp,
  sameBinding,
  resolveSeekTarget,
  watchUrl,
} from "../src/domain/identity";
import {
  validateNotebookName,
  validateNoteText,
  searchNotebook,
} from "../src/domain/library";
import type {
  NotebookSnapshot,
  PlayerBinding,
  PlayerSnapshot,
} from "../src/domain/types";

export const binding: PlayerBinding = {
  windowId: 1,
  tabId: 2,
  documentId: "doc",
  documentToken: "token",
  generation: 1,
  videoId: "abcdefghijk",
};
export const ready: PlayerSnapshot = {
  binding,
  videoId: binding.videoId,
  status: "ready",
  title: "Bài học",
  currentTime: 80.9,
  duration: 100,
  seekable: [{ start: 0, end: 100 }],
};
describe("video identity and time", () => {
  it("identifies watch videos independently of playlist and tracking", () => {
    expect(
      parseVideoId(
        new URL("https://www.youtube.com/watch?v=abcdefghijk&list=PL1&t=4"),
      ),
    ).toBe("abcdefghijk");
    expect(watchUrl("abcdefghijk")).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
  });
  it.each([
    "https://evil.test/watch?v=abcdefghijk",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://www.youtube.com/watch?v=bad",
    "http://www.youtube.com/watch?v=abcdefghijk",
  ])("rejects unsupported identity %s", (url) =>
    expect(parseVideoId(new URL(url))).toBeNull(),
  );
  it("rejects an earlier visit to the same video", () =>
    expect(sameBinding(binding, { ...binding, generation: 3 })).toBe(false));
  it("formats floor seconds and hours without changing captured time", () => {
    expect(formatTimestamp(80.9)).toBe("01:20");
    expect(formatTimestamp(3661.9)).toBe("1:01:01");
  });
  it.each([NaN, Infinity, -1])("refuses invalid seek %s", (n) =>
    expect(() => resolveSeekTarget(ready, n)).toThrow(),
  );
  it("clamps a note past the shortened video to the available end", () =>
    expect(resolveSeekTarget(ready, 120)).toBe(100));
  it("does not seek an ad or live media", () => {
    expect(() => resolveSeekTarget({ ...ready, status: "ad" }, 80)).toThrow();
    expect(() => resolveSeekTarget({ ...ready, status: "live" }, 80)).toThrow();
  });
});
describe("notebook text and search", () => {
  it("validates boundaries without truncation or destroying note whitespace", () => {
    expect(validateNotebookName("  React  ")).toBe("React");
    expect(validateNotebookName("x".repeat(120))).toHaveLength(120);
    expect(() => validateNotebookName("x".repeat(121))).toThrow();
    expect(() => validateNotebookName("  ")).toThrow();
    expect(validateNoteText("  Ghi chú\n")).toBe("  Ghi chú\n");
    expect(validateNoteText("x".repeat(50000))).toHaveLength(50000);
    expect(() => validateNoteText("x".repeat(50001))).toThrow();
    expect(() => validateNoteText("\n ")).toThrow();
  });
  const base = {
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    revision: 1,
  };
  const snapshot: NotebookSnapshot = {
    notebook: { ...base, id: "book", name: "Học" },
    videos: ["abcdefghijk", "lmnopqrstuv"].map((videoId) => ({
      ...base,
      videoId,
      notebookId: "book",
      title: "Trùng tên",
      addedAt: base.createdAt,
    })),
    notes: [
      {
        ...base,
        id: "n2",
        videoId: "lmnopqrstuv",
        text: "Ghi chú",
        timestampSeconds: 20,
      },
      {
        ...base,
        id: "n1",
        videoId: "abcdefghijk",
        text: "GHI CHÚ",
        timestampSeconds: 10,
      },
    ],
  };
  it("normalizes Vietnamese NFC/NFD while retaining accents and video identity", () => {
    expect(
      searchNotebook(snapshot, "ghi chú").map((g) => g.video.videoId),
    ).toEqual(["abcdefghijk", "lmnopqrstuv"]);
    expect(searchNotebook(snapshot, "ghi chu")).toEqual([]);
  });
  it("keeps the video filter when clearing search", () =>
    expect(
      searchNotebook(snapshot, "", "lmnopqrstuv")[0].notes.map((n) => n.id),
    ).toEqual(["n2"]));
});
