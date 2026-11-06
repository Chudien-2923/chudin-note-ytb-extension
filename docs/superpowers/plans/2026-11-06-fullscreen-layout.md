# Fullscreen split layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep fullscreen video/captions/controls completely visible beside the persistent note panel.

**Architecture:** A focused layout manager owns only temporary page/player styling. The existing iframe host remains stable and uses top-layer popover presentation for actual DOM fullscreen. Viewport and YouTube fullscreen transitions recompute geometry without replacing media or notes.

**Tech Stack:** Chrome116 MV3, TypeScript, DOM/CSS, Vite, Vitest/jsdom.

**Spec:** docs/superpowers/specs/2026-11-06-fullscreen-layout-design.md

## Global Constraints

- No browser/desktop automation, install, Git mutation or publication; work in place.
- Existing 420px preferred panel, fullscreen maximum half viewport; video object-fit contain, no crop/stretch.
- Keep the same iframe/video nodes; no changes to database, keyboard/timestamp/save contracts.
- Preserve user/page style changes when restoring; remove only owned styles/markers.
- No auto-close on save or automatic exit from fullscreen.

## Review Focus

- Actual fullscreen root cannot be resized by ordinary CSS; resize contained media/overlay layers instead.
- Caption/title/transport/gradients must share the media's available width.
- Leaving fullscreen, closing, player replacement and disposal restore prior styles.
- Repeated resize/fullscreen events must never reload/reparent the iframe.
- Narrow windows retain both regions; regular page behavior still restores its original margin.

### Task 1: Reversible layout and stable host

Files: create src/content/panel-layout.ts; modify src/content/panel-host.ts; create tests/panel-layout.test.ts; extend tests/panel-host.test.ts.

Interface: createPanelLayout(doc:Document, preferredWidth:number) -> {show():number; hide():void; dispose():void}. show computes actual panel width, applies fullscreen stage styling or ordinary margin reservation, and returns that width. Host owns fullscreenchange/resize/YouTube class/player replacement subscriptions, calls layout.show while visible, and never remounts the frame. For native DOM fullscreen use element popover='manual' and togglePopover(true); on leaving mode/close remove only owned popover presentation.

- [x] Write behavioral regressions for fullscreen fit at 1600x900 (420 panel,1180 media); 640x480 (320 panel,320 media); correct computed CSS geometry/object-fit for video/captions/controls; close/exit and player replacement restoration; ordinary margin restoration. Run targeted tests RED.
- [x] Implement the layout manager and host integration, using an owned per-player marker and stylesheet, no mutation of existing video inline layout. Add host regressions proving same iframe across resize/fullscreen/top-layer lifecycle. Run targeted GREEN, then full suite/typecheck.

### Task 2: Build, smoke, review and delivery

Files: README.md, DESIGN.md, AGENTS.md, CHANGELOG.md, docs/TESTING.md and this plan.

- [x] Build/pack/unzip; run actual content IIFE in command-line jsdom with controlled viewport/DOM fullscreen boundary. Observe a 16:9 video fitting wholly before the panel, transport/caption boundaries, stable frame, restored layout after close/exit/resize. Do not claim real browser rendering.
- [x] Fresh focused source review for layout/lifecycle defects, fix consequential findings with regression evidence, run final typecheck/full suite/build/package/smoke.
- [x] Update current documentation and user evidence; remove throwaway smoke. Give user exact Reload + YouTube reload, fullscreen OptionN and close checks. Keep user-only actual Chrome/layout acceptance distinct.

Ruling: user already chose this behavior and authorized implementation/build tooling; execute without another workflow-choice question. No worktree/Git scripts because they violate the project boundary. Same scoped host is retained; this is a layout adaptation, not a redesign.

Evidence:213/213 tests in16 files, typecheck/build/pack/unzip and built-content IIFE DOM smoke pass. Source review menu anchoring issue fixed RED→GREEN; remaining native/DOM assumptions and minor notes in docs/TESTING.md. SHA2565e15acd77644bb42dc61c8c14fa7253f9ad2c2ed84b7b3ad42449af24626ecdd. No browser/desktop/Git operations. User acceptance of the new pixel layout remains pending.
