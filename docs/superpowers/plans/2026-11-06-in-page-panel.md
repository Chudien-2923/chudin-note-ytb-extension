# In-page panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Option+N focuses the existing note editor without a mouse and new quick notes use a timestamp 20 seconds earlier.

**Architecture:** The existing panel runs in an extension-origin iframe controlled by the top-frame content script. A worker-issued, document-bound session protects the web-accessible entry. Existing storage and playback invariants remain intact.

**Tech Stack:** TypeScript, MV3 Chrome 116, Vite, IndexedDB, Vitest/jsdom.

**Spec:** docs/superpowers/specs/2026-11-06-in-page-panel-design.md

## Global Constraints

- No browser/desktop automation, installation, Git mutations, commit/push/publication.
- Work in the existing authorized repository: no worktree/commit scripts because they mutate Git.
- No additional permissions; remove native sidePanel permission/config and obsolete native opening paths.
- No database schema/name change; preserve installed data.
- Session token never enters DOM attributes, iframe URLs or page-visible outbound messages.
- New quick timestamp max(0, pauseSeconds - 20); manual notes and existing drafts unchanged.

## Review Focus

- A page-authored iframe/message must never gain note read/write authority.
- Worker restart or reauthentication must not lose local input or retry a mutation blindly.
- Closing/reopening while a write is pending must preserve its editor and timestamp.
- Keyboard input/IME must stay in the frame, not trigger YouTube shortcuts.
- A new pause/navigation must revoke stale save/resume authority.

### Task 1: Authenticated iframe worker routing

Files: src/background/{index,handlers,quick-note,panel-shortcut,panel-sessions}.ts; tests/{security,shortcut,quick-note}.test.ts. Shared protocol owned by integration owner if needed.

Wire contract: panel.open from trusted active top-frame content returns normal reply.result {windowId:number, session:string}; optional quickNote report creates quick intent as before. panel.attach from extension-origin /sidepanel.html iframe carries panelSession and returns {windowId:number}; it binds the session to that frame document. All iframe RPC envelopes carry panelSession. Native panel callers no longer authorized. Toolbar sends {version:1,op:'panel.toggle'} to the supported YouTube tab; unsupported tabs open the notebook. Runtime invalidation still reaches extension iframe contexts.

- [x] Write regressions for session origin/frame/tab/document theft, legitimate panel data operations, reattach and restart rejection. Migrate native-specific obsolete tests rather than testing API forwarding.
- [x] Integration owner runs targeted RED before production changes; implement session/routing boundaries without browser or Git.
- [x] Integration owner runs targeted GREEN and full suite after integration.

### Task 2: Focusable in-page host and existing panel reuse

Files: src/content/{index,panel-host}.ts; src/panel/{index,controller}.ts; src/ui/{client,shared}.ts; manifest.json; tests/panel-host.test.ts; existing panel tests.

Host creates a closed shadow root with one extension-origin iframe. It focuses the frame synchronously, passes session privately to the exact frame origin, and hides without destroying on close. Frame waits for handshake and panel.attach before mounting; it can reauthenticate without remounting. mountPanel requires an authenticated explicit windowId; obsolete Chrome windows lookup removed and all callers migrated. Dialogs remain inside the extension document. Chrome permission/config are removed, sidepanel.html and its packaged assets are narrowly web-accessible. Do not make content script an arbitrary note RPC bridge.

- [x] Write host tests for focus, hide/reopen identity, trusted message targeting, stale ready messages, close and teardown/layout restoration; run RED.
- [x] Implement host, frame bootstrap, client session headers and controller initialization; run targeted GREEN.
- [x] Exercise source/build worker+content+iframe modules with command-line Chrome adapters and fake IndexedDB; no OS-focus claims.

### Task 3: Quick timestamp offset

Files: src/ui/note-editor.ts; tests/note-editor.test.ts.

- [x] Write behavioral tests: 720→700, 12→0, repeated shortcut preserves existing draft timestamp/text, manual capture remains current. Run RED before edit.
- [x] Apply offset only at new-draft timestamp creation when pendingQuick exists, preserving the captured binding and pause time. Run GREEN and full suite.

### Task 4: Integration, review, delivery

Files: scripts/pack.mjs if runtime allowlist changes; README.md; PRODUCT.md; DESIGN.md; AGENTS.md; CHANGELOG.md; docs/TESTING.md and affected contributor/release docs.

- [x] Run npm run typecheck, npm test, npm run build, npm run pack, unzip -t on the actual archive.
- [x] Run non-browser smoke through real built bundles: host focus→authenticated iframe mount→720 pause→700 note→commit before resume; hide/reopen retains input; unauthenticated frame denied.
- [x] Fresh source review, fix actionable authority/data-loss findings with regression proof, then rerun verification once.
- [x] Update current docs to the in-page host and 20-second quick offset; preserve historical evidence as historical. Give the user Reload-extension/reload-YouTube acceptance steps. Never claim native focus passed without their report.

Ruling: user has authorized autonomous implementation/build and said 'Xử lý đi'; execute directly rather than reopening execution-method/plan confirmation. Authored tests may be run by the integration owner for RED/GREEN while delegated implementation agents skip builds/checks/tests. All final integrated checks run once after edits settle.

Ruling: all panel authentication failures use UNAUTHORIZED to trigger reauthentication. STALE_CONTEXT remains player/navigation state, so stale bindings do not create handshake loops. No request is automatically replayed.
Ruling: jsdom does not create browsing contexts for shadow-root iframes; tests/smoke supply only that missing browser boundary via a test-owned iframe contentWindow. This does not certify Chrome focus, origin enforcement or layout.

Completion evidence: 204/204 tests (15 files), typecheck/build/pack/unzip and real built worker/content/panel ESM Node/jsdom smoke pass. Fixed review regressions: post-save disabled focus, window move scope, no post-attach refresh, and unconditional loading-event revocation. Actual Chrome focus/layout/IME remain pending user acceptance; source work left in place without Git mutation.
