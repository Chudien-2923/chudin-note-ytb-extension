# In-page panel and quick-note timestamp

Approved in chat: replace the native Chrome panel host while preserving the existing panel UI and editor; no auxiliary input or popup. Latest user addition: a newly created Option+N note uses max(0, paused time - 20 seconds), e.g. 12:00 → 11:40. Pause stays at 12:00. Continuing/restoring a draft never changes its original timestamp. Manual new notes keep the current timestamp.

## Approach

Use the existing extension-origin sidepanel.html inside an iframe hosted on the right of YouTube. This is not a native side panel. A closed shadow root isolates the frame and host styles; the extension origin, not the shadow root, isolates note content and keyboard events from YouTube. Direct DOM rendering was rejected because a shadow root is not a security boundary. A separate popup and auxiliary quick input were rejected by the user.

The content script focuses its iframe synchronously in the shortcut handler. The existing editor focuses the textarea after its draft is ready. N and the toolbar open the same host, Option+N pauses/captures and opens the quick-note editor, Enter commits before playback, Shift+Enter and IME remain safe. Closing hides rather than destroys the iframe, preserving pending input. YouTube SPA navigation reuses the host and existing binding guards. A close button replaces Chrome's native panel close control; the host reserves space on the right when visible and restores layout on hide/dispose. Fullscreen is not guaranteed and must not silently capture an ad/live timestamp.

## Authority

sidepanel.html must become web-accessible only on https://www.youtube.com/* to load the iframe. It must show no notes or controls until authenticated. A service-worker session is issued only to the authenticated active top-frame YouTube content script, scoped to its tab, window and document. The token remains in isolated-world memory, never in a DOM attribute, frame URL or page-visible message. Content sends it directly to the exact extension-origin iframe via postMessage with an exact target origin. The frame presents it to the worker and binds to its own sender.documentId. All panel RPCs require the token plus the matching authenticated frame sender. Wrong origins, tabs, frames, documents and copied/guessed tokens are rejected. Notebook extension pages retain their existing authority. No page-to-storage or arbitrary postMessage-to-RPC bridge.

Worker restart invalidates transient authority, not notes. The frame can request reauthentication from its host; mutating RPCs are not silently retried. Failed writes retain the local editor and report failure. Reauthentication must not remount/drop local input.

## Constraints

Keep IndexedDB schema, storage names and installed extension identity unchanged. No browser/desktop automation, installation, Git mutations, commit/push/publication. Only repository tooling and Node/jsdom smoke are permitted. No additional permissions: remove sidePanel permission/config and obsolete native opening code. Chrome 116 floor retained. Native keyboard focus and YouTube layout remain user-operated acceptance checks, not claims from jsdom.
