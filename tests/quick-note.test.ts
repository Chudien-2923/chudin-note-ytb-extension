import { expect, it, vi } from "vitest";
import { createPanelSessions } from "../src/background/panel-sessions";
import { createQuickNoteRequests } from "../src/background/quick-note";
import { AppError, type PlayerReport } from "../src/domain/types";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const origin = `chrome-extension://${extensionId}`;
const watch = "https://www.youtube.com/watch?v=abcdefghijk";
const report: PlayerReport = {
  documentToken: "token",
  generation: 1,
  videoId: "abcdefghijk",
  title: "Lesson",
  status: "ready",
  currentTime: 83.25,
  duration: 100,
  seekable: [{ start: 0, end: 100 }],
};
const binding = {
  windowId: 7,
  tabId: 4,
  documentId: "host-4",
  documentToken: "token",
  generation: 1,
  videoId: "abcdefghijk",
};
function host(
  documentId = "host-4",
  tab: Partial<chrome.tabs.Tab> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 0,
    documentId,
    url: watch,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
  };
}
function frame(
  documentId = "frame-4",
  tab: Partial<chrome.tabs.Tab> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 5,
    documentId,
    url: `${origin}/sidepanel.html`,
    origin,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
  };
}
const quick = (requestId: string, quickNote: PlayerReport = report) => ({
  version: 1,
  op: "panel.open",
  requestId,
  quickNote,
});
function setup() {
  const panels = createPanelSessions(extensionId);
  const requests = createQuickNoteRequests(panels);
  const attach = (
    frameSender: chrome.runtime.MessageSender,
    grant: { session: string },
  ) => {
    panels.attach(grant.session, frameSender);
    return panels.authorize(grant.session, frameSender);
  };
  return { panels, requests, attach };
}
function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_APP_ERROR";
  }
  return undefined;
}

it("retains paused timestamp until the same-tab panel acknowledges it; old ACK cannot erase a new intent", () => {
  const { requests, attach } = setup();
  const first = requests.open(quick("one"), host());
  expect(first.windowId).toBe(7);
  const authority = attach(frame(), first);
  expect(requests.peek(authority)).toMatchObject({
    id: "one",
    snapshot: {
      currentTime: 83.25,
      binding: { tabId: 4, windowId: 7, documentId: "host-4" },
    },
  });
  const second = requests.open(
    quick("two", { ...report, currentTime: 90 }),
    host(),
  );
  expect(second.session).toBe(first.session);
  requests.ack(authority, "one");
  expect(requests.peek(authority)?.id).toBe("two");
  requests.ack(authority, "two");
  expect(requests.peek(authority)).toBeNull();
});
it("lets a panel see and acknowledge only the intent of its own tab", () => {
  const { requests, attach } = setup();
  const mine = requests.open(quick("mine"), host());
  const myAuthority = attach(frame(), mine);
  const otherHost = host("host-5", { id: 5 });
  const other = requests.open(
    quick("theirs", { ...report, documentToken: "other-token" }),
    otherHost,
  );
  const otherAuthority = attach(frame("frame-5", { id: 5 }), other);
  expect(requests.peek(myAuthority)).toMatchObject({
    id: "mine",
    snapshot: { binding: { tabId: 4 } },
  });
  expect(requests.peek(otherAuthority)).toMatchObject({
    id: "theirs",
    snapshot: { binding: { tabId: 5, documentToken: "other-token" } },
  });
  requests.ack(otherAuthority, "mine");
  expect(requests.peek(myAuthority)?.id).toBe("mine");
});
it("a panel in a tab without a pause request sees nothing", () => {
  const { requests, attach } = setup();
  const grant = requests.open(
    { version: 1, op: "panel.open", requestId: "plain" },
    host(),
  );
  expect(requests.peek(attach(frame(), grant))).toBeNull();
});
it("refuses ads, mismatched videos and invalid envelopes without retaining an intent", () => {
  const { requests, panels, attach } = setup();
  expect(
    code(() => requests.open(quick("ad", { ...report, status: "ad" }), host())),
  ).toBe("PLAYER_UNAVAILABLE");
  expect(
    code(() =>
      requests.open(
        quick("other", { ...report, videoId: "zzzzzzzzzzz" }),
        host(),
      ),
    ),
  ).toBe("UNAUTHORIZED");
  expect(code(() => requests.open({ ...quick("v"), version: 2 }, host()))).toBe(
    "INVALID_INPUT",
  );
  expect(
    code(() => requests.open({ ...quick("op"), op: "panel.toggle" }, host())),
  ).toBe("INVALID_INPUT");
  expect(
    code(() => requests.open({ ...quick(""), requestId: "" }, host())),
  ).toBe("INVALID_INPUT");
  expect(
    code(() =>
      requests.open({ ...quick("x"), requestId: "x".repeat(1001) }, host()),
    ),
  ).toBe("INVALID_INPUT");
  expect(
    code(() => requests.open(quick("shorts"), { ...host(), frameId: 1 })),
  ).toBe("UNAUTHORIZED");
  const grant = requests.open(
    { version: 1, op: "panel.open", requestId: "ok" },
    host(),
  );
  expect(requests.peek(attach(frame(), grant))).toBeNull();
  expect(panels.trustedHost(host())).toMatchObject({ tabId: 4 });
});
it("does not take the window or tab from the request body", () => {
  const { requests } = setup();
  const grant = requests.open(
    { ...quick("spoof"), windowId: 999, tabId: 999 },
    host(),
  );
  expect(grant.windowId).toBe(7);
});
it("expires an unconsumed focus request rather than opening a stale note later", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2026-11-06T00:00:00Z"));
    const { requests, attach } = setup();
    const grant = requests.open(quick("expired"), host());
    const authority = attach(frame(), grant);
    vi.setSystemTime(new Date("2026-11-06T00:01:01Z"));
    expect(requests.peek(authority)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it("a newer quick pause revokes permission for the old save to resume playback, even after the new intent is acknowledged", () => {
  const { requests, attach } = setup();
  const grant = requests.open(quick("old-save"), host());
  const authority = attach(frame(), grant);
  requests.ack(authority, "old-save");
  expect(() =>
    requests.assertResume(authority, { id: "old-save", binding }),
  ).not.toThrow();
  requests.open(quick("new-pause"), host());
  requests.ack(authority, "new-pause");
  expect(
    code(() => requests.assertResume(authority, { id: "old-save", binding })),
  ).toBe("STALE_CONTEXT");
  expect(() =>
    requests.assertResume(authority, { id: "new-pause", binding }),
  ).not.toThrow();
});
it("resume needs the exact pause binding and a lease of the caller's own tab", () => {
  const { requests, attach } = setup();
  const grant = requests.open(quick("lease"), host());
  const authority = attach(frame(), grant);
  for (const forged of [
    { documentId: "host-other" },
    { documentToken: "other" },
    { videoId: "zzzzzzzzzzz" },
    { tabId: 5 },
    { windowId: 8 },
    { generation: 2 },
  ])
    expect(
      code(() =>
        requests.assertResume(authority, {
          id: "lease",
          binding: { ...binding, ...forged },
        }),
      ),
    ).toBe("STALE_CONTEXT");
  expect(
    code(() => requests.assertResume(authority, { id: "", binding })),
  ).toBe("STALE_CONTEXT");
  const otherHost = host("host-5", { id: 5 });
  const other = requests.open(
    quick("lease-5", { ...report, documentToken: "t5" }),
    otherHost,
  );
  const otherAuthority = attach(frame("frame-5", { id: 5 }), other);
  expect(
    code(() => requests.assertResume(otherAuthority, { id: "lease", binding })),
  ).toBe("STALE_CONTEXT");
  // The other tab's pause does not revoke this tab's lease.
  expect(() =>
    requests.assertResume(authority, { id: "lease", binding }),
  ).not.toThrow();
});
it("opening a new content document in the tab drops the old document's intent and resume lease", () => {
  const { requests, attach } = setup();
  const first = requests.open(quick("doc-a"), host());
  const oldAuthority = attach(frame(), first);
  const second = requests.open(
    { version: 1, op: "panel.open", requestId: "doc-b" },
    host("host-4b"),
  );
  const newAuthority = attach(frame("frame-4b"), second);
  expect(requests.peek(newAuthority)).toBeNull();
  expect(requests.peek(oldAuthority)).toBeNull();
  expect(
    code(() =>
      requests.assertResume(newAuthority, {
        id: "doc-a",
        binding: { ...binding, documentId: "host-4b" },
      }),
    ),
  ).toBe("STALE_CONTEXT");
  expect(
    code(() => requests.assertResume(oldAuthority, { id: "doc-a", binding })),
  ).toBe("STALE_CONTEXT");
});
it("forgetting a tab removes its pending intent and lease", () => {
  const { requests, attach } = setup();
  const grant = requests.open(quick("gone"), host());
  const authority = attach(frame(), grant);
  requests.forgetTab(4);
  expect(requests.peek(authority)).toBeNull();
  expect(
    code(() => requests.assertResume(authority, { id: "gone", binding })),
  ).toBe("STALE_CONTEXT");
});
