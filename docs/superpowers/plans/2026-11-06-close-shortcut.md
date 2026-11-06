# Close-panel shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this small inline change. No Git/browser/desktop operations.

**Goal:** Option+Command+physical N hides the open note panel, including from its textarea.
**Architecture:** Shared keyboard guard; parent content handles page keys, iframe sends the existing private host lifecycle a close-only message. Reuse host.hide so layout is restored and iframe/drafts remain intact.
**Tech Stack:** Existing TypeScript MV3 DOM implementation, Chrome116, Vitest/jsdom.
**Spec:** User requested Option+Command+N. Existing docs/superpowers/specs/2026-11-06-in-page-panel-design.md and fullscreen-layout-design remain authoritative.

## Approved design / approaches

Implement close-only, not toggle: closed panel stays closed and no note is created. Use exact alt+meta+KeyN without ctrl/shift/repeat/composition/keyCode229. It works in text fields outside active IME. Hide is not save, discard, pause, resume or fullscreen exit; no new global Chrome commands or Windows shortcut implied. Preserve existing N/OptionN and same frame/20-second timestamp logic. This follows the existing close button rather than adding another UI or reusing OptionN as a toggle.

## Global Constraints

No browser/desktop/GUI, extension install, Git mutation/publication. Keep existing storage/schema/permissions and iframe identity. No automatic mutation retries or playback changes. Native OS-reserved shortcut acceptance remains user test.

## Review Focus

- Textarea shortcut must close but never submit/delete notes.
- IME/repeat/modifier boundaries cannot swallow normal typing.
- Wrong-origin/source lifecycle cannot close the host.
- Closed panel cannot be reopened by the new shortcut.
- Existing quick workflow and fullscreen restore remain intact.

## Task

Files: src/content/keyboard.ts, src/content/index.ts, src/panel/frame.ts, src/panel/frame-protocol.ts, src/content/panel-host.ts; tests/shortcut.test.ts and tests/panel-host.test.ts.

- [x] Write guard and host/frame end-to-end DOM regressions, observe RED.
- [x] Add shouldClosePanelShortcut(event:ShortcutKey), accept private lifecycle close; parent and frame dispatch it before open/quick paths. Reuse hide only; no playback/storage calls. Run GREEN/full suite/typecheck.
- [x] Run actual built-bundle close scenario in Node/jsdom; build/pack/unzip; update README/AGENTS/CHANGELOG/TESTING with user fullscreen success and new shortcut, delete throwaway smoke. Native Chrome/OS check user-operated.

Ruling: user already authorizes autonomous build implementation, this is a precise additive shortcut using existing close semantics; no further workflow/choice gate or Git/worktree scripts.

Verification:215/215 tests/16 files; typecheck/build/pack/unzip + built-content IIFE close smoke pass. Closed stays closed, private-source close restores layout without playback/storage commands, same iframe/text on reopen. SHA256917eea3169a39b8ad2e89af50c0a50d35937ccae57b8feb5415add172e33805e. Native Mac key reception and Vietnamese IME check remain user-operated; no claim of browser automation. No Git mutation or publication.
