# Fullscreen note layout

User correction: panel now appears and the prior missing-panel report is withdrawn. Screenshot confirms the right-hand panel overlays/cuts off fullscreen video/subtitles. User explicitly chose side-by-side viewing and writing, not automatic panel dismissal after saving.

## Approved behavior

Stay in fullscreen. When notes are visible, fit the entire video proportionally in the left region and place the existing panel on the right; do not crop/stretch video, captions or transport controls underneath the panel. Closing restores the original full player. Saving keeps the panel open. Preserve Option+N focus, 20-second timestamp rewind, draft identity and Enter save/resume semantics.

## Approach and constraints

Use a narrowly scoped YouTube fullscreen layout stylesheet for the existing #movie_player, video container, video, captions, gradients/title and transport layers. Contain the full media image rather than scaling it asymmetrically or changing playback resolution. Do not move/wrap the video element or reparent/remount the authenticated iframe. Preserve original inline styles by not overwriting media layout styles; remove our style/marker on close, fullscreen exit, replacement and disposal. React to fullscreenchange, resize and YouTube player/class replacement without resetting note state. Normal-page margin reservation remains supported and must restore its prior inline value/priority.

Keep the existing preferred panel width of 420px. In fullscreen cap it at half the viewport width so both viewing and writing regions exist on narrow windows. The fullscreen player retains its viewport-sized root; its media and overlay/control layers use the left region. Use a manual popover top-layer host only for actual DOM Fullscreen API mode, avoiding an invisible sibling behind the fullscreen element. Browser-window fullscreen/YouTube .ytp-fullscreen uses the same split media layout. No automatic fullscreen exit, no popup/new editor.

Rejected: keep the overlay but hide after save (does not solve occlusion while writing, user chose persistence); exit fullscreen automatically (changes requested viewing mode); reparent player/frame to a new wrapper (can reset media/frame/drafts); scaleX on player (distorts image).

No browser/desktop automation, extension install, Git mutations or publication. Same repository, Chrome116, TS/Vite and IndexedDB schema unchanged. Native pixel/CSP/focus/YouTube DOM verification remains user-operated. The screenshot's session-expired message is observed but user reports function works; this task does not infer a new authentication bug from a potentially stale status.
