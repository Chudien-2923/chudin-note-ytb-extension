import { openDatabase } from "../storage/database";
import { createRepository } from "../storage/repository";
import { createPendingSeekStore } from "../storage/pending-seeks";
import { clock, asAppError } from "../domain/types";
import { createTabCoordinator, type TabCoordinator } from "./tabs";
import { createBackgroundHandlers, type BackgroundHandlers } from "./handlers";
import { createPanelSessions } from "./panel-sessions";
import { createQuickNoteRequests } from "./quick-note";
import { handleToolbarClick } from "./panel-shortcut";
// Transient authority: a worker restart drops it, and panel frames reauthenticate through their host.
const panels = createPanelSessions(chrome.runtime.id);
const quickNotes = createQuickNoteRequests(panels);
let handlers: Promise<BackgroundHandlers> | undefined;
let tabs: TabCoordinator | undefined;
const ready = () =>
  (handlers ??= openDatabase()
    .then((db) => {
      tabs = createTabCoordinator({
        chromeApi: chrome,
        pendingSeeks: createPendingSeekStore(db),
        clock,
        extensionId: chrome.runtime.id,
      });
      void tabs.reconcilePending();
      return createBackgroundHandlers({
        repository: createRepository(db, clock),
        tabs,
        extensionId: chrome.runtime.id,
        notify(change) {
          void chrome.runtime.sendMessage(change).catch(() => {});
        },
        panels,
        quickNotes,
      });
    })
    .catch((error) => {
      handlers = undefined;
      throw error;
    }));
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    message &&
    typeof message === "object" &&
    "op" in message &&
    message.op === "invalidate"
  )
    return;
  void ready()
    .then((h) => h.handleRequest(message, sender))
    .then(respond)
    .catch((error) => {
      const e = asAppError(error);
      const requestId =
        message &&
        typeof message === "object" &&
        "requestId" in message &&
        typeof message.requestId === "string"
          ? message.requestId
          : "";
      const op =
        message &&
        typeof message === "object" &&
        "op" in message &&
        typeof message.op === "string"
          ? message.op
          : "invalid";
      respond({
        version: 1,
        requestId,
        op,
        ok: false,
        error: { code: e.code, message: e.message },
      });
    });
  return true;
});
chrome.action.onClicked.addListener((tab) => {
  void handleToolbarClick(tab, {
    sendToTab: (tabId, message, options) =>
      chrome.tabs.sendMessage(tabId, message, options),
    openNotebook: (input) => ready().then(() => tabs!.openNotebook(input)),
  }).catch((error) => {
    console.warn(asAppError(error).message);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  panels.revokeTab(tabId);
  quickNotes.forgetTab(tabId);
  void ready()
    .then(() => tabs!.onTabRemoved(tabId))
    .catch(() => {});
});
const invalidate = () => {
  void chrome.runtime
    .sendMessage({
      version: 1,
      op: "invalidate",
      videoIds: [],
      notebookIds: [],
    })
    .catch(() => {});
};
chrome.tabs.onActivated.addListener(invalidate);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  // "loading" does not identify the changed document (it may be a subframe).
  // Top-document reports/open bind documentId; only leaving YouTube revokes here.
  if (change.url && !change.url.startsWith("https://www.youtube.com/")) {
    panels.revokeTab(tabId);
    quickNotes.forgetTab(tabId);
  }
  if (change.url || change.status === "complete") invalidate();
});
