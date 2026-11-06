import { describe, expect, it } from "vitest";
import { createPanelSessions } from "../src/background/panel-sessions";
import { AppError } from "../src/domain/types";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const origin = `chrome-extension://${extensionId}`;
const watch = "https://www.youtube.com/watch?v=abcdefghijk";

function host(
  overrides: Partial<chrome.runtime.MessageSender> = {},
  tab: Partial<chrome.tabs.Tab> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 0,
    documentId: "host-4",
    url: watch,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
    ...overrides,
  };
}
function frame(
  overrides: Partial<chrome.runtime.MessageSender> = {},
  tab: Partial<chrome.tabs.Tab> = {},
): chrome.runtime.MessageSender {
  return {
    id: extensionId,
    frameId: 5,
    documentId: "frame-4",
    url: `${origin}/sidepanel.html`,
    origin,
    tab: {
      id: 4,
      windowId: 7,
      active: true,
      url: watch,
      ...tab,
    } as chrome.tabs.Tab,
    ...overrides,
  };
}
function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_APP_ERROR";
  }
  return undefined;
}

describe("session issue", () => {
  it("issues an unguessable per-document token and takes the window from the sender, not the request", () => {
    const sessions = createPanelSessions(extensionId);
    const grant = sessions.open(host());
    expect(grant.windowId).toBe(7);
    expect(grant.session).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const other = sessions.open(
      host({ documentId: "host-5" }, { id: 5, windowId: 9 }),
    );
    expect(other.windowId).toBe(9);
    expect(other.session).not.toBe(grant.session);
  });
  it("reuses the same token for the same top document, even for a newly active window", () => {
    const sessions = createPanelSessions(extensionId);
    const first = sessions.open(host());
    sessions.attach(first.session, frame());
    expect(sessions.open(host()).session).toBe(first.session);
    // The attached frame keeps working after a repeated open.
    expect(sessions.authorize(first.session, frame())).toMatchObject({
      tabId: 4,
      windowId: 7,
      hostDocumentId: "host-4",
      frameDocumentId: "frame-4",
    });
    const moved = sessions.open(host({}, { windowId: 8 }));
    expect(moved).toEqual({ windowId: 8, session: first.session });
  });
  it.each([
    ["foreign extension", { id: "foreign" }],
    ["subframe", { frameId: 1 }],
    ["missing frame id", { frameId: undefined }],
    ["no document id", { documentId: undefined }],
    [
      "lookalike host",
      { url: "https://www.youtube.com.evil.test/watch?v=abcdefghijk" },
    ],
    ["non-https", { url: "http://www.youtube.com/watch?v=abcdefghijk" }],
    ["shorts", { url: "https://www.youtube.com/shorts/abcdefghijk" }],
    ["home page", { url: "https://www.youtube.com/" }],
    ["extension page", { url: `${origin}/sidepanel.html` }],
    ["no tab", { tab: undefined }],
  ])("refuses a non-trusted top frame: %s", (_name, override) => {
    const sessions = createPanelSessions(extensionId);
    expect(code(() => sessions.open({ ...host(), ...override } as never))).toBe(
      "UNAUTHORIZED",
    );
  });
  it("refuses an inactive or invalid tab", () => {
    const sessions = createPanelSessions(extensionId);
    expect(code(() => sessions.open(host({}, { active: false })))).toBe(
      "UNAUTHORIZED",
    );
    expect(code(() => sessions.open(host({}, { windowId: -1 })))).toBe(
      "UNAUTHORIZED",
    );
    expect(code(() => sessions.open(host({}, { id: undefined })))).toBe(
      "UNAUTHORIZED",
    );
  });
  it("describes the trusted host without issuing a session", () => {
    const sessions = createPanelSessions(extensionId);
    expect(sessions.trustedHost(host())).toEqual({
      tabId: 4,
      windowId: 7,
      documentId: "host-4",
    });
    expect(code(() => sessions.trustedHost(host({ frameId: 2 })))).toBe(
      "UNAUTHORIZED",
    );
  });
});

describe("frame attach", () => {
  it("binds the token to the exact extension frame document and its sender tab", () => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    expect(code(() => sessions.authorize(session, frame()))).toBe(
      "UNAUTHORIZED",
    );
    expect(sessions.attach(session, frame())).toEqual({ windowId: 7 });
    expect(sessions.attach(session, frame())).toEqual({ windowId: 7 });
    expect(sessions.authorize(session, frame())).toMatchObject({
      tabId: 4,
      windowId: 7,
    });
  });
  it.each([
    ["top-level web-accessible panel", { frameId: 0 }],
    ["foreign extension", { id: "foreign" }],
    ["notebook page", { url: `${origin}/notebook.html` }],
    ["unlisted extension page", { url: `${origin}/evil.html` }],
    ["page-hosted frame", { url: watch }],
    [
      "forged youtube origin on an extension url",
      { origin: "https://www.youtube.com" },
    ],
    ["opaque origin", { origin: "null" }],
    ["different extension origin", { origin: "chrome-extension://other" }],
    ["no document id", { documentId: undefined }],
    ["no frame id", { frameId: undefined }],
  ])("rejects attach from %s", (_name, override) => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    expect(
      code(() =>
        sessions.attach(session, { ...frame(), ...override } as never),
      ),
    ).toBe("UNAUTHORIZED");
    expect(code(() => sessions.authorize(session, frame()))).toBe(
      "UNAUTHORIZED",
    );
  });
  it("rejects a token copied into another tab's frame, before and after the owner attached", () => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    const foreign = frame({ documentId: "frame-5" }, { id: 5, windowId: 7 });
    expect(code(() => sessions.attach(session, foreign))).toBe("UNAUTHORIZED");
    sessions.attach(session, frame());
    expect(code(() => sessions.authorize(session, foreign))).toBe(
      "UNAUTHORIZED",
    );
    expect(sessions.authorize(session, frame())).toMatchObject({ tabId: 4 });
  });
  it("rejects another frame document in the same tab until it attaches; the last attach replaces the old frame", () => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    sessions.attach(session, frame());
    const sibling = frame({ documentId: "frame-4b", frameId: 6 });
    expect(code(() => sessions.authorize(session, sibling))).toBe(
      "UNAUTHORIZED",
    );
    // An iframe reload gets a new document; it re-attaches with the host-provided token.
    sessions.attach(session, sibling);
    expect(sessions.authorize(session, sibling)).toMatchObject({
      frameDocumentId: "frame-4b",
    });
    expect(code(() => sessions.authorize(session, frame()))).toBe(
      "UNAUTHORIZED",
    );
  });
  it("rejects missing, malformed and unknown tokens as unauthorized", () => {
    const sessions = createPanelSessions(extensionId);
    sessions.open(host());
    for (const bad of [undefined, null, 17, "", {}, "x".repeat(5000)])
      expect(code(() => sessions.attach(bad, frame()))).toBe("UNAUTHORIZED");
    expect(code(() => sessions.attach("guessed-token", frame()))).toBe(
      "UNAUTHORIZED",
    );
    expect(code(() => sessions.authorize("guessed-token", frame()))).toBe(
      "UNAUTHORIZED",
    );
    expect(code(() => sessions.authorize(undefined, frame()))).toBe(
      "UNAUTHORIZED",
    );
  });
  it("requires reauthentication when the tab moved windows after attach", () => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    sessions.attach(session, frame());
    expect(
      code(() => sessions.authorize(session, frame({}, { windowId: 8 }))),
    ).toBe("UNAUTHORIZED");
  });
  it("rejects a tab that navigated away from YouTube", () => {
    const sessions = createPanelSessions(extensionId);
    const { session } = sessions.open(host());
    sessions.attach(session, frame());
    expect(
      code(() =>
        sessions.authorize(session, frame({}, { url: "https://evil.test/" })),
      ),
    ).toBe("UNAUTHORIZED");
  });
});

describe("authority lifetime", () => {
  it("a worker restart drops every session; the old token needs reauthentication", () => {
    const before = createPanelSessions(extensionId);
    const { session } = before.open(host());
    before.attach(session, frame());
    const after = createPanelSessions(extensionId);
    expect(code(() => after.authorize(session, frame()))).toBe("UNAUTHORIZED");
    expect(code(() => after.attach(session, frame()))).toBe("UNAUTHORIZED");
    // A fresh authenticated top-frame open lets the same frame recover.
    const fresh = after.open(host());
    after.attach(fresh.session, frame());
    expect(after.authorize(fresh.session, frame())).toMatchObject({ tabId: 4 });
  });
  it("a new content document in the same tab revokes the old frame and token", () => {
    const sessions = createPanelSessions(extensionId);
    const old = sessions.open(host());
    sessions.attach(old.session, frame());
    const next = sessions.open(host({ documentId: "host-4b" }));
    expect(next.session).not.toBe(old.session);
    expect(code(() => sessions.authorize(old.session, frame()))).toBe(
      "UNAUTHORIZED",
    );
    // The old frame cannot claim the new token without the new host handing it over and
    // cannot do so as another document it does not control.
    expect(code(() => sessions.authorize(next.session, frame()))).toBe(
      "UNAUTHORIZED",
    );
    sessions.attach(next.session, frame({ documentId: "frame-4c" }));
    expect(
      sessions.authorize(next.session, frame({ documentId: "frame-4c" })),
    ).toMatchObject({ hostDocumentId: "host-4b" });
  });
  it("a player report from a different top document of the tab revokes the session; same document and other tabs do not", () => {
    const sessions = createPanelSessions(extensionId);
    const mine = sessions.open(host());
    sessions.attach(mine.session, frame());
    const other = sessions.open(
      host({ documentId: "host-5" }, { id: 5, windowId: 7 }),
    );
    sessions.attach(
      other.session,
      frame({ documentId: "frame-5" }, { id: 5, windowId: 7 }),
    );
    sessions.observeTopDocument(host());
    sessions.observeTopDocument(host({ frameId: 3, documentId: "subframe" }));
    sessions.observeTopDocument(host({ id: "foreign", documentId: "spoof" }));
    expect(sessions.authorize(mine.session, frame())).toMatchObject({
      tabId: 4,
    });
    sessions.observeTopDocument(
      host({ documentId: "host-4-after-navigation" }),
    );
    expect(code(() => sessions.authorize(mine.session, frame()))).toBe(
      "UNAUTHORIZED",
    );
    expect(
      sessions.authorize(
        other.session,
        frame({ documentId: "frame-5" }, { id: 5, windowId: 7 }),
      ),
    ).toMatchObject({ tabId: 5 });
  });
  it("revoking a tab removes its authority and leaves other tabs alone", () => {
    const sessions = createPanelSessions(extensionId);
    const mine = sessions.open(host());
    sessions.attach(mine.session, frame());
    const other = sessions.open(
      host({ documentId: "host-5" }, { id: 5, windowId: 7 }),
    );
    sessions.attach(
      other.session,
      frame({ documentId: "frame-5" }, { id: 5, windowId: 7 }),
    );
    sessions.revokeTab(4);
    expect(code(() => sessions.authorize(mine.session, frame()))).toBe(
      "UNAUTHORIZED",
    );
    expect(
      sessions.authorize(
        other.session,
        frame({ documentId: "frame-5" }, { id: 5, windowId: 7 }),
      ),
    ).toMatchObject({ tabId: 5 });
    // A reopened panel in the revoked tab gets a different token.
    expect(sessions.open(host()).session).not.toBe(mine.session);
  });
});
