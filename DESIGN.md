# Interface direction

Authority: the approved YouTube notebook design under docs/superpowers/specs. This records its existing user-approved visual constraints; it does not propose a new visual identity.

- In-page panel mode: Operate. Reuse the existing panel/editor UI in an extension-origin iframe on the right of YouTube; replace native Chrome host, not add an auxiliary editor. Real title, notebook selector, bounded notes, persistent multiline editor, explicit Save/durability. A host close control hides without destroying the iframe.
- Fullscreen: keep the complete aspect-preserving video on the left, notes on the right. Captions/title/transport share the available media width; fullscreen root stays viewport-sized. Preferred note width420px, capped at half viewport; close restores page/player styles, save does not dismiss. Native DOM fullscreen presents the same host in the top layer, without moving the iframe.
- Notebook page mode: Read. Notebook navigation, video list, text search, and note groups with timestamp links; no player or simulated Chrome window.
- System font, base 14px, headings 16–20px, comfortable line-height. Timestamp numerals tabular. Reading measure 72ch.
- Palette via semantic CSS variables: light paper/toolbar/input backgrounds, dark equivalents, subtle separators, readable muted text, blue action/focus and explicit error colors. Follow prefers-color-scheme.
- Compact controls with 6px corners, 4/8/12/16/24px spacing. No nested cards, gradients, display fonts, network fonts/images or entry animations.
- Keep textarea DOM/selection stable through invalidation. Errors must preserve work and state the next action. Use real empty states, no demo notes.
- Option+N focuses the iframe synchronously then its existing textarea after authenticated draft initialization. Quick timestamps start 20 seconds before pause, clamped at zero. Reopening/continuing never resets existing text/time. Keyboard focus/layout in actual Chrome must be checked by the user.
- Visible keyboard focus; safe plain-text note rendering, newline preservation, long-title/link wrapping; 320px panel width and short-height scrolling.
- Verification limitation: the user forbids browser/desktop automation. Command-line DOM smoke can verify behavior, not pixels, actual Chrome panel appearance, or native IME. Human Chrome review remains mandatory.
