# Quick Note Implementation Plan

> Native execution under existing build-tool authorization. No browser/desktop/Git control.

## User-approved interaction

Option+N on the YouTube watch page pauses the main video, opens the panel, starts a timestamped draft or continues the current draft, and focuses the text box. In this quick-note mode, Enter commits and then resumes that exact video; Shift+Enter inserts a newline. IME Enter never submits. Failed writes preserve input and do not resume. Manual/reader editors retain their multiline Enter and Cmd/Ctrl+Enter behavior. N alone still opens only.

## Decisions

Use page-local physical Alt+KeyN detection so macOS Option+N's Dead key is recognized without consuming it inside editable fields. No native global command, new permission, schema or network service. Pause and capture happen synchronously in the trusted key handler. Native panel opening still calls sidePanel.open before awaits.

A transient worker intent keyed by window carries sender-derived tab/document/video/generation and the paused snapshot. A panel peeks/acknowledges it only after loading its own window context. It expires after 60s; worker restart may require pressing the shortcut again, never loses committed notes. Multiple recovered drafts require explicit selection; no notebook requires selecting one before writing.

## Steps

- [x] Regression: physical Option+N Dead key, ordinary N, text/IME/modifier safety; pause snapshot rejects ads/stale context.
- [x] Authenticated panel-open path with paused quick-note report, sender validation and panel-only peek/ack; no database await before open.
- [x] Panel quick-focus/new or recovered draft at paused time; keeps text/time, serializes starts and does not drop replacement intent or create a new draft after declined recovery.
- [x] Authenticated resumePlayer after commit, same binding and current request lease; no resume after save failure/Shift+Enter/IME, stale navigation or newer pause.
- [x] 84 tests/typecheck/build and actual-module/built-worker/content smoke pass. Human Chrome focus/user-gesture/play checks remain pending.

Review: independent playback/security and editor reviewers; Important findings fixed in one regression pass. Tradeoffs and deferred minor/native checks are in docs/TESTING.md. No browser/Git control or schema/permission change.
