# AGENTS.md

## Project and current status

This repository is the source of a Google Chrome extension for taking notes in a side panel while watching YouTube. It is intended to be published on GitHub, released for others to install, and developed openly through issues and pull requests.

Current stage: implementation complete; user reported the fullscreen/quick-note/close-shortcut flows work and requested commit/push to GitHub on 2026-11-07. Command evidence: 215 tests, typecheck/build/pack/unzip and built-content smoke. Current plan: `docs/superpowers/plans/2026-11-06-close-shortcut.md`; evidence/remaining untested variants: docs/TESTING.md. GitHub source delivery is authorized; no tag/release/Store publication or browser/desktop control is authorized.

## Confirmed user requirements

- Run as a Google Chrome extension, not an independent application.
- Let the viewer open a side panel while watching YouTube and write notes about relevant moments.
- Use `note-iina` as product inspiration.
- Include a course-style notebook for reviewing notes across multiple videos, like `note-iina`. The user chose manually created notebooks with an explicit notebook selection for each video, rather than grouping automatically by YouTube playlist.
- Keep the source here and prepare for public GitHub releases and community contributions. Distribution is GitHub-only; Chrome Web Store publication is explicitly out of scope.
- Unmodified N opens the panel on a focused YouTube watch page. Preserve typing/search/comments, IME, repeats and modified shortcuts including Shift+N.
- Latest approved host: reuse the existing panel UI in an extension-origin iframe inside the YouTube page on the right, replacing native chrome.sidePanel. No auxiliary quick editor or popup. The user approved this because native Chrome UI does not transfer keyboard focus.
- Option+N/Alt+N pauses the main player, focuses the same panel textarea and creates/continues a draft. A **new quick note uses max(0, paused time - 20 seconds)**; 12:00 → 11:40 while playback pauses at 12:00. Existing/restored drafts retain text and timestamp; manual new notes use current time. Quick-mode Enter commits before resuming the same video; Shift+Enter newline, IME no submit, failed save no resume.
- Fullscreen UX now explicitly supported: keep the full aspect-preserving video/captions/transport in the left region, existing panel on the right; close restores the original region. Saving does not auto-hide the panel. Preferred420px notes capped at half the fullscreen viewport. Never reparent/remount the video or authenticated iframe to implement fullscreen; reversible scoped styles and top-layer host presentation only.
- Mac Option+Command+physical N closes the visible panel from the page or its textarea, ignoring composition/repeat/extra modifiers. Close-only, not toggle: hidden stays hidden. Reuse host.hide; keep iframe/drafts, restore fullscreen layout, no explicit note save/discard/pause/resume. No global command or implied Windows shortcut. User confirmed the fullscreen split works before requesting this addition.

## User execution boundary

- The user permits autonomous repository build tooling (dependency installs, typechecking, tests, builds, packaging, and non-browser command-line smoke scripts). This supersedes the earlier conservative restriction on command execution.
- Do not launch or automate desktop applications, Chrome, a managed browser, browser relay, browser extensions UI, or any GUI, even for inspection or smoke verification.
- Build-tool authorization alone does not permit browser/desktop control or publication. The user's explicit 2026-11-07 request additionally authorizes committing and pushing this source to GitHub, including configuring this repo's remote; this supersedes earlier user-only Git restrictions. Do not infer tag/release/Store publication or extension installation.
- For Chrome installation, UI checks or other prohibited operations, send the user exact UI steps, expected results, and requested evidence; wait for their report.
- Attribute verification correctly: distinguish source review, user-reported command output, user-reported Chrome observations, and checks not yet performed. Never claim a build or scenario passed without evidence.
- Outside an explicit user request, do not automatically commit/push/publish. The current request covers source commit/push only. Source/Git authorization never permits machine/browser control.

## Reference: note-iina

The sibling repository `../note-iina` is available in the original development workspace. Public reference: https://github.com/Chudien-2923/note-iina. It must not become a build or runtime dependency; contributors should be able to work from this repository alone.

Start with its `PRODUCT.md`, `DESIGN.md`, and `README.md`. Inspect source when reusing a specific behavior, and check its license before copying code or assets. Inspiration is not a requirement to port every feature or its IINA-specific architecture.

Accepted behavior patterns from the approved design:

- Manually written notes associated with the correct video.
- A timestamp captured when a note starts, rather than after the viewer finishes writing.
- Clickable timestamps for returning to the relevant moment.
- Explicit save feedback and recoverable drafts; failed writes must not lose text.
- A quiet, compact interface that leaves attention on the video.

Course-style notebooks, manual video grouping, note editing/deletion, and search within a notebook are approved. One video belongs to one notebook and can be moved with all its notes. Export/import, cloud sync, and Chrome Web Store publication are out of scope. Its local course-folder storage, native windows, and IINA host APIs do not transfer directly to Chrome.

## Before implementation

1. Read the existing code and project documents before making choices. If none exist, say so rather than inventing conventions or commands.
2. Follow the approved product design; propose material scope changes before implementing them.
3. Preserve the design's video identity, timestamp, save/draft, persistence, tab/window routing, and stale-navigation invariants.
4. Approved choices: Manifest V3, TypeScript strict, Vite, plain HTML/CSS/DOM, npm, IndexedDB, Vietnamese UI, MIT license, display name `Chudin Note for YouTube`, minimum Chrome 116. Installed tooling needs Node 22.13+ in the 22.x line or Node 24 LTS; exact versions live in package.json/package-lock.json.
5. Keep plans and code within the requested scope. AI summaries, transcription, accounts, cloud sync, analytics, and a backend are not implied by this project.

## Chrome and YouTube engineering rules

- Use Manifest V3 and supported APIs. Native chrome.sidePanel was explicitly superseded by the approved in-page iframe host; do not reintroduce it or its permission.
- The web-accessible panel entry must mount only after worker-authenticated frame attach. Bind session to the trusted active top-frame YouTube document and exact extension frame document/tab/window. Never place tokens in DOM/URL or page-visible messages; do not add a generic page-to-storage RPC bridge. Keep notes inside extension-origin DOM, not merely a closed shadow root.
- Request only permissions required by implemented features. Explain each permission. Do not default to `<all_urls>` or broad browsing access.
- Separate page/video access, extension coordination, panel UI, and persistence responsibilities. Do not keep durable notes or the only copy of a draft in service-worker memory.
- Treat YouTube titles, URLs, page content, messages, and imported notes as untrusted input. Validate message payloads and sender context; render note text safely without interpreting arbitrary HTML.
- Associate notes with a canonical YouTube video ID, not the title, full URL, playlist position, or tab ID. Tab IDs describe live context, not durable identity.
- Handle YouTube's in-page navigation, tab changes, video replacement, and temporary player absence. Prevent stale responses from writing a note to another video or seeking the wrong tab.
- Define supported YouTube surfaces explicitly. Do not assume watch pages, Shorts, embeds, live streams, ads, or fullscreen have identical behavior.
- During ads do not capture note timestamps or advertiser metadata as the lesson title. Use the identity-matched watch heading; clear stale ad feedback and restore new-note availability when the main video is ready. Existing drafts remain editable.
- Keyboard opening focuses the same-tab iframe synchronously before awaits; the authenticated existing editor focuses its textarea when ready. Node/jsdom proves DOM focus only, never native keyboard routing. Keep iframe alive on hide to avoid dropping uncommitted input.
- Do not intercept typing or Vietnamese IME composition. Preserve editable-field behavior and account for YouTube/browser shortcut conflicts.
- Keep executable code packaged with the extension. No remotely hosted executable code, secrets, or undocumented external data transfers.

## Data safety and UX

- Minimize collection. Do not add telemetry or send note text, video history, or page content to a server without an explicit product decision.
- Report a note as saved only after persistence succeeds. Preserve recoverable input on failure, panel closure, and navigation according to the approved design.
- Account for concurrent edits from multiple panels/tabs and extension service-worker restarts. Do not overwrite newer data with stale state.
- Version persisted schemas and define migration behavior before changing stored data. Never silently reset corrupted or incompatible data to an empty notebook.
- Explain storage limits, backup options, and the effect of uninstalling the extension. Local browser storage is not a backup.
- Use real empty, loading, unsupported-page, and error states; no shipped demo notes or fake success states.
- Support keyboard navigation, visible focus, readable contrast, narrow panels, long notes/titles, and Vietnamese text. Keep visual distraction low.

## Verification

Use the actual project commands for autonomous build/test/package verification, and assess real output. Chrome/UI verification remains human-operated. Keep command evidence distinct from user-reported browser observations.

Commands: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run pack`. Loadable output: `dist/`; GitHub ZIP: `artifacts/chudin-note-youtube-0.1.0.zip` (use actual package version for later releases). See `docs/TESTING.md` for evidence and the human Chrome checklist.

For behavioral changes, give the user concrete steps to exercise the affected extension path in Chrome; only the user operates Chrome. Relevant scenarios include opening the in-page panel, Option+N typing without a mouse, the 20-second new quick-note offset, reopening persisted notes, seeking, in-page navigation, switching YouTube tabs/windows, draft recovery and persistence failures. Record user observations separately from source/command checks. No browser/desktop automation.

Add deterministic regression tests for meaningful data, navigation, concurrency, and recovery boundaries. Unit tests do not replace checking Chrome integration. If the environment cannot load an extension, report that limitation rather than treating a regular webpage preview as proof.

## Open-source and release discipline

- Keep the repository independently buildable; do not depend on sibling repositories, absolute local paths, private agent tooling, or credentials.
- Keep private notes, browsing data, tokens, local configuration, and generated dependencies out of commits and release artifacts. Use sanitized fixtures for bug reports and tests.
- Before the first public release, provide a README with capabilities and limitations, reproducible setup/build instructions, the approved MIT license, contribution guidance, a changelog, and a release procedure.
- Explain installation accurately. A GitHub source archive is not a signed Chrome Web Store installation. If distributing an unpacked build, document extraction, `chrome://extensions`, Developer mode, Load unpacked, and manual updates.
- Adopt consistent semantic versions across the manifest, package metadata if present, Git tags, and release notes. Package only runtime assets, not private data, local tooling, or development dependencies.
- Document Chrome versions and scenarios actually verified. Never label an artifact Chrome Web Store-published or automatically updating unless that distribution path exists and has been verified.
- Update affected documentation when shipping behavior. Execute Git/remote/push only when explicitly requested (authorized for this delivery on 2026-11-07). Tags, GitHub Releases and Chrome Web Store submission require their own explicit scope; this request does not include them.
