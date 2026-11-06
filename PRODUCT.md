# Chudin Note for YouTube

<!-- impeccable:product-schema 1 -->

## Platform

web

Chrome extension pages and a content script, not a hosted website or independent application.

## Stack

User-approved: Manifest V3, TypeScript strict, Vite, plain HTML/CSS/DOM, npm, IndexedDB; Chrome 116 API floor. Installed tooling supports Node 22.13+ in the 22.x line or Node 24 LTS; package engines specify the supported lines.

## Users

People watching YouTube lessons who want to write notes at important moments and review related videos together. The owner requested the experience of `note-iina` for YouTube.

## Product Purpose

Capture the viewer's own understanding beside the video and return to that moment later. Manual writing, not generated summaries.

## Operating Context

The panel is for writing while watching, hosted on the right inside YouTube in an authenticated extension-origin iframe. The user approved replacing the native Chrome panel after keyboard focus failed, without adding a second editor or popup. A separate extension tab reads/searches notebooks. Each video belongs to one manually selected notebook.

Option+N/Alt+N pauses the main video and focuses a new or existing draft. New quick notes use max(0, paused time - 20 seconds), e.g. 12:00 → 11:40; the player stays at 12:00. Existing drafts retain text/time; manual new notes capture current time. Quick Enter commits before resuming the same video, Shift+Enter is newline and IME/save failure never resumes or submits. N alone opens the panel; manual/reader editors remain multiline.

User-approved fullscreen adaptation: fit the entire video proportionally in the left region, notes on the right without overlaying media/captions/transport. Keep fullscreen and keep the panel open after saving; closing restores the original viewing area. Reuse the same iframe and media nodes through resize/fullscreen transitions. Preferred panel 420px, capped at half the fullscreen viewport.

## Capabilities and Constraints

Approved design: timestamp at draft start, explicit save, recoverable drafts, note edit/delete, notebook create/rename/move video, local reading/search and pause/seek. Vietnamese UI and Unicode search. No accounts/cloud/AI/telemetry/export/import/backup. GitHub ZIP distribution only; no Chrome Web Store. Losing/uninstalling the extension/profile can lose data.

## Brand Commitments

Display name Chudin Note for YouTube. Restrained host-like experience inspired by note-iina; do not simulate a player or add distracting decoration. MIT license approved.

## Evidence on Hand

Approved design and implementation plan under docs/superpowers. Automated command evidence does not certify Chrome integration. Browser/desktop automation is forbidden by the user; actual Chrome observations must come from them. No customer claims or sample user notes may be fabricated.

## Product Principles

1. Writing is part of learning.
2. Never claim saved until durable commit succeeds.
3. Keep every note/draft associated with the correct video.
4. Respect Chrome/YouTube ownership of playback and window behavior.
5. Keep the project independently buildable and local-first.

## Accessibility & Inclusion

Keyboard navigation, clear focus, accessible status/errors, Vietnamese IME and multiline text, light/dark, long text wrapping and narrow panels are required by the approved design.
