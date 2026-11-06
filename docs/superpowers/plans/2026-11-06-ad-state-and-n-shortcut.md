# Ad State and N Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native implementation, user-authorized build tooling; no browser/desktop or Git mutations.

**Goal:** Address the reported disabled editor screenshot without accepting ad timestamps, and implement the user's explicit N-to-open request.
**Architecture:** Retain player → worker → panel flow; canonical watch heading takes precedence over ad metadata. A dedicated synchronous worker shortcut handler opens the native panel before any database awaits.
**Tech Stack:** Existing TypeScript/Chrome MV3/Vitest/jsdom/Vite, no new dependencies or permissions.
**Spec:** Original approved design plus the user's subsequent explicit request for unmodified N, superseding the earlier no-N decision.

**Status:** Source, tests, command smoke, build/ZIP complete. Native Chrome user-gesture and after-ad acceptance still pending the user's manual check.

## Global Constraints

- Screenshot evidence shows a real YouTube ad and panel ad guard; do not mislabel it as a proven failure after the ad ends.
- New notes require a selected notebook and a ready main video; do not sample ad currentTime. Existing drafts remain editable.
- N opens, not toggles or autosaves. Only when the YouTube page has focus; not browser URL bar/other applications.
- Preserve text entry, contenteditable/shadow-host editors, IME, repeats and all modified shortcuts including Shift+N.
- Accept shortcut messages only from this extension's top-frame www.youtube.com sender and trusted keyboard events at the content-script entry. Use sender window ID, never payload window IDs.
- Call sidePanel.open synchronously from the message listener; Chrome owns actual user-gesture enforcement. No DB initialization or asynchronous tabs query before opening.
- No browser/desktop automation, extra permissions, schema change, Git mutation or publishing. Build stays 0.1.0 until maintainer chooses a release.

## Review Focus

1. Ad metadata has the main video's ID but an advertiser title: do not persist it as the lesson title.
2. Ad→ready state must clear stale ad status without discarding a draft or taking an ad timestamp.
3. N inside text entry/IME/shadow DOM and Shift+N must remain normal input/YouTube behavior.
4. A forged window ID, foreign sender or subframe cannot open a panel in another window.
5. Opening must not await database or lose the gesture; native behavior remains a human Chrome check.

## Task 1: Correct canonical title and ad transition feedback

**Files:** Modify src/content/player.ts, src/panel/controller.ts, src/ui/shared.ts; tests/navigation.test.ts.
**Interfaces:** Preserve inspectPage, PlayerReport and panel contracts; no public signature changes.

- [x] Add failing title regression: ad metadata says advertiser but watch heading says lesson; inspectPage returns lesson title, status ad and null timestamp. With no canonical heading, ad title stays null.
- [x] Run targeted RED, implement canonical heading precedence, prevent ad metadata fallback, keep ad time guard.
- [x] Add/observe ad→ready report transition with main-video time; run targeted/full tests.
- [x] Panel clears stale page-status copy when ready; refreshes empty-state guidance when notebook/status changes. Non-browser integration smoke exercised selected-book panel ad→ready→note save.

## Task 2: N opens native panel without stealing input

**Files:** Create src/content/keyboard.ts, src/background/panel-shortcut.ts, tests/shortcut.test.ts; modify content/index.ts and background/index.ts.
**Interfaces:** shouldOpenPanelShortcut(event: ShortcutKey, path: EventTarget[]): boolean; handlePanelShortcut(message: unknown, sender: chrome.runtime.MessageSender, extensionId: string, open: (options: chrome.sidePanel.OpenOptions) => Promise<void>): Promise<void>.

- [x] Write RED keyboard boundary and sender-authority regressions. Test the decision and observed open window state, not string matching source/wiring.
- [x] Implement key guard; content entry accepts only trusted keydown, checks composedPath and calls runtime.sendMessage immediately, preventing only the recognized unmodified N.
- [x] Implement sender validation and synchronous API call. Worker handles panel.open before ready(); error response, no fake successful open on API rejection.
- [x] Run tests/typecheck and command smoke of real built worker entry with unopened database: open requested synchronously, no IndexedDB. Chrome user-gesture acceptance remains unverified.

## Task 3: Docs, build and human handoff

**Files:** Update AGENTS/README/CHANGELOG/TESTING and original spec/plan to replace no-N rule.

- [x] Record user's Chrome screenshot evidence precisely: installed panel renders, notebook selected, ad detected; note creation blocked while ad is visible. Whole Chrome acceptance not marked PASS.
- [x] Explain automatic readiness after ad; retain sample-data/no-backup warning.
- [x] Run full tests (71 pass), typecheck, build/pack/unzip, fresh-source ad smoke and built-worker smoke; remove temporary scripts afterward.
- [ ] User reloads the same extension and the YouTube tab, waits for the main video, tests N outside/inside editable fields and saves a note. No uninstall/data reset.

No commits/push/release. User has delegated build execution and explicitly requested N; no additional architecture choice or approval gate is needed for this narrow change.
