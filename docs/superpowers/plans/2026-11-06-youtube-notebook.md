# YouTube Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build “Chudin Note for YouTube”: ghi chú có timestamp trong native Chrome side panel và đọc/tìm ghi chú nhiều video trong cuốn sổ tự tạo, phân phối qua GitHub.

**Architecture:** TypeScript domain modules giữ identity/revision/session invariants; service worker xác thực và điều phối mọi database mutation qua IndexedDB transactions. Content script chỉ đọc player và thực hiện seek có binding; panel và trang cuốn sổ có controller/render riêng. Không backend hoặc phụ thuộc `note-iina` khi build/runtime.

**Tech Stack:** Manifest V3, Chrome 116+, TypeScript strict, Vite, HTML/CSS/DOM thuần, npm/Node 22+, IndexedDB, Vitest và fake-indexeddb. Dùng `@resvg/resvg-js` cho icons PNG từ SVG và `fflate` cho ZIP trong build tooling, không trong runtime extension.

**Spec:** `docs/superpowers/specs/2026-11-06-youtube-notebook-design.md` — đã được người dùng duyệt, gồm ràng buộc không điều khiển máy tính/browser.

**Plan status:** Approved and implemented natively. Tasks 1–7 have local source/command evidence; Task 8 command smoke and human checklist are prepared, while native Chrome acceptance is pending the user. Independent source reviews and one fix pass completed; see `docs/TESTING.md` for observed results, decisions and deferred minor notes. Earlier user-run install/test/build/pack wording is superseded by autonomous build-tool authorization. Chrome/desktop operation and Git mutations/publishing remain prohibited.

**User-requested amendment:** N mở panel trên trang video, cùng sửa title/status quảng cáo; xem `2026-11-06-ad-state-and-n-shortcut.md`. Mọi dòng no-N ở bản kế hoạch ban đầu bên dưới được thay bằng phím N ngoài editable/IME và không modifier, không global. Cấm browser/Git mutations vẫn giữ nguyên.

## Global Constraints

- Tên hiển thị `Chudin Note for YouTube`; MIT; giao diện và hướng dẫn sử dụng tiếng Việt.
- Manifest V3; minimum Chrome `116`; Node `22+`; TypeScript strict, Vite, npm với lockfile; không UI framework.
- Native side panel + tab cuốn sổ; một video thuộc đúng một sổ; không tự gom theo playlist.
- Timestamp khi bắt đầu nháp; icon/N và ghi thủ công không tự pause/resume. Yêu cầu bổ sung `2026-11-06-quick-note.md`: Option+N pause/focus, Enter lưu thành công rồi resume đúng video, Shift+Enter xuống dòng. Bấm timestamp vẫn pause và seek.
- Tên sổ trim, không rỗng, tối đa `120` ký tự; note tối đa `50.000` ký tự, không cắt ngầm, không lưu note chỉ có whitespace.
- Văn bản thuần; tìm NFC + không phân biệt hoa/thường, giữ phân biệt dấu; timestamp hiển thị phần nguyên mm:ss hoặc h:mm:ss.
- Snapshot/seek chỉ hợp lệ với đúng window/tab/document/video/generation; seek có thời hạn `15 giây`.
- `sidePanel` là permission API duy nhất; host/content-script match `https://www.youtube.com/*`, top frame; không `<all_urls>`, `tabs`, `storage`, `scripting`, `downloads`, `unlimitedStorage`, history/cookies/filesystem.
- Không cloud, AI, analytics, remote code/assets, export/import, xóa cả sổ, incognito, playlist import, Shorts/embed/mobile/live/DVR support hoặc player riêng.
- `incognito: "not_allowed"`; không hứa panel trong fullscreen, auto-update, backup hoặc tương thích file IINA.
- Chỉ GitHub Release ZIP unpacked; không Chrome Web Store hoặc quy trình submit Store.
- Trợ lý được tự chạy công cụ build trong repository: cài dependency, typecheck/test/build/pack và command-line smoke không browser. Không điều khiển GUI, app/browser, browser relay hoặc browser automation; không ủy quyền thao tác bị cấm.
- Chỉ các thao tác Chrome/UI còn giao người dùng. Phân biệt bằng chứng command do trợ lý chạy, quan sát Chrome do người dùng báo và phần chưa thử; không giả PASS.
- Không tự commit/push/publish. Bước checkpoint không đồng nghĩa trợ lý được chạy Git.

## Review Focus

Năm tình huống cần được review riêng và đã có owner kiểm thử bên dưới:

1. YouTube URL/player chuyển A→B→A trong lúc reply đang về: binding của lần A cũ không hợp lệ cho lần A mới — Task 3 và Task 4.
2. Retry sau khi commit thành công nhưng reply bị mất: không nhân đôi note và không phục hồi draft đã xóa — Task 2.
3. Tab khác đổi sổ, trong lúc title cập nhật hoặc draft đang phục hồi: title không tăng membership revision; draft stale vẫn đọc được và chỉ rebind khi xác nhận — Task 2 và Task 5.
4. Tiếng Việt NFC/NFD, IME và note chứa HTML/link dài: tìm đúng dấu, không kích hoạt save giữa composition, không thực thi HTML — Task 1, Task 5, Task 6; quan sát UI do người dùng thực hiện.
5. Worker restart/seek timeout khi tab được tái sử dụng hoặc player quảng cáo: không thao tác nhầm video và không báo thành công khi chưa có ACK đúng — Task 3, Task 4 và Task 8.

## File structure and ownership

Các đường dẫn dưới đây là **file dự kiến tạo**, không phải file đã tồn tại.

- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`: toolchain và scripts.
- `manifest.json`: MV3 manifest nguồn, cùng version với package.
- `sidepanel.html`, `notebook.html`: hai entry HTML; không inline script/handler.
- `assets/icon.svg`: nguồn icon local; build tạo PNG 16/32/48/128 vào `dist/icons/`.
- `scripts/build.mjs`: Vite builds, manifest/version validation, PNG generation.
- `scripts/pack.mjs`: ZIP runtime build và từ chối file ngoài allowlist.
- `src/domain/types.ts`: entity, binding, snapshot, error types và constants.
- `src/domain/identity.ts`: parse/validate video ID, canonical URL, binding comparison, timestamp formatting và seek range validation.
- `src/domain/library.ts`: validation text/tên sổ, search/group/sort thuần.
- `src/domain/editor.ts`: editor state machine, local versions và stale reply guards.
- `src/storage/database.ts`: database schema/open lifecycle và typed transaction helper.
- `src/storage/repository.ts`: notebook/video/note/draft transactions.
- `src/storage/pending-seeks.ts`: durable pending seeks theo target tab.
- `src/shared/protocol.ts`: command union, request/reply/error payload validation, sender roles.
- `src/content/player.ts`: DOM/player inspection, navigation generations và cleanup.
- `src/content/index.ts`: content-script lifecycle/message handlers.
- `src/background/handlers.ts`: authenticated command handler và snapshots.
- `src/background/tabs.ts`: window-local binding, notebook tab và seek routing.
- `src/background/index.ts`: top-level Chrome listener registration, không logic domain.
- `src/ui/client.ts`: typed runtime client và invalidation subscriptions.
- `src/ui/shared.ts`, `src/ui/shared.css`: safe DOM primitives, dialogs/status/focus và tokens.
- `src/panel/controller.ts`, `src/panel/view.ts`, `src/panel/index.ts`: panel state/actions, rendering và entry.
- `src/notebook/controller.ts`, `src/notebook/view.ts`, `src/notebook/index.ts`: reader state/actions, rendering và entry.
- `tests/domain.test.ts`, `tests/repository.test.ts`, `tests/navigation.test.ts`, `tests/security.test.ts`, `tests/editor.test.ts`: chỉ behavioral/invariant tests.
- `tests/fixtures.ts`: deterministic test data và isolated fake database factory; không chứa data production.
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `RELEASING.md`, `LICENSE`, `docs/TESTING.md`: cập nhật theo chức năng thực sự đã có.
- `.github/workflows/ci.yml`: typecheck/tests/build/pack trên PR; không publish.
- Sửa `AGENTS.md`, `.gitignore` khi scripts/artifacts thực tế được thiết lập.

## Shared interfaces

### Domain types — Task 1 owns definitions

`Notebook`, `VideoEntry`, `Note`, `Draft`, `PendingSeek` có fields như spec mục 6. `revision` là integer dương; `videoRevision` trên Draft là membership revision. Thời gian dữ liệu là ISO UTC; ID do `crypto.randomUUID()` tạo, riêng video ID theo YouTube.

- `PlayerBinding = { windowId: number; tabId: number; documentId: string; documentToken: string; generation: number; videoId: string }`. `documentId` lấy từ Chrome sender, không từ nội dung trang.
- `PageStatus = "ready" | "unsupported" | "loading" | "ad" | "live" | "unavailable" | "reload-required"`.
- `PageInspection = { status: PageStatus; videoId: string | null; title: string | null; currentTime: number | null; duration: number | null; seekable: Array<{start:number;end:number}> }`.
- `PlayerReport = PageInspection & { documentToken: string; generation: number }`; content script không tự khai window/tab/documentId đáng tin cậy.
- `PlayerSnapshot = PageInspection & { binding: PlayerBinding }`.
- `VideoSnapshot = { video: VideoEntry | null; notes: Note[]; drafts: Draft[] }`.
- `NotebookSnapshot = { notebook: Notebook; videos: VideoEntry[]; notes: Note[] }`.
- `PanelContext = { windowId: number; tabId: number | null; videoId: string | null; binding: PlayerBinding | null; player: PlayerSnapshot | null; status: PageStatus; notebooks: Notebook[]; data: VideoSnapshot }`.
- `FailureCode = "INVALID_INPUT" | "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT" | "UNSUPPORTED" | "STALE_CONTEXT" | "PLAYER_UNAVAILABLE" | "SEEK_TIMEOUT" | "STORAGE_FAILED" | "SCHEMA_UNSUPPORTED"`; `AppError` mang `code: FailureCode` và thông điệp Việt an toàn.
- `Clock = { now(): string; newId(): string }`; production dùng UTC ISO và UUID, test inject deterministic clock/IDs.

### Repository — Task 2 owns implementation

`openDatabase(factory?: IDBFactory, name?: string): Promise<IDBDatabase>` trong `database.ts`; mặc định `indexedDB`, tên `chudin-note-youtube`, schema `1`.

`createRepository(db: IDBDatabase, clock: Clock): Repository` trong `repository.ts`. Tất cả methods trả Promise và throw `AppError` khi thất bại:

- `listNotebooks(): Promise<Notebook[]>`.
- `createNotebook(input: {name:string}): Promise<Notebook>`.
- `renameNotebook(input: {id:string;name:string;expectedRevision:number}): Promise<Notebook>`.
- `assignVideo(input: {videoId:string;title:string;notebookId:string}): Promise<VideoEntry>` — chỉ gán mới; lặp cùng membership là no-op, không ngầm chuyển sổ.
- `moveVideo(input: {videoId:string;notebookId:string;expectedRevision:number}): Promise<VideoEntry>`.
- `updateVideoTitle(input: {videoId:string;title:string}): Promise<VideoEntry>` — không tăng membership revision.
- `readVideo(input: {videoId:string}): Promise<VideoSnapshot>`; `readNotebook(input: {notebookId:string}): Promise<NotebookSnapshot>`.
- `putDraft(input: {draft:Omit<Draft,"revision"|"updatedAt">;expectedRevision:number|null}): Promise<Draft>` — null chỉ cho tạo mới; repo tăng revision, kiểm tra writer và video membership.
- `restoreDraft(input: {sourceId:string;expectedSourceRevision:number;writerId:string;newDraftId:string}): Promise<Draft>` — transaction copy trước khi retire bản source; không xóa draft writer khác.
- `rebindDraft(input: {id:string;writerId:string;expectedDraftRevision:number;expectedCurrentVideoRevision:number}): Promise<Draft>` — chỉ sau UI confirmation, cùng video/note, tăng draft revision.
- `discardDraft(input: {id:string;writerId:string;expectedRevision:number}): Promise<void>`.
- `commitDraft(input: {draft:Draft}): Promise<Note>` — expected revisions từ snapshot, DB draft phải khớp text/timestamp/writer/revision. New-note ID = draft ID; edit dùng noteId/expectedNoteRevision.
- `deleteNote(input: {id:string;expectedRevision:number}): Promise<void>` — không cascade xóa draft của người viết khác.

`createPendingSeekStore(db: IDBDatabase): PendingSeekStore` trong `pending-seeks.ts`:

- `get(input:{tabId:number}): Promise<PendingSeek|null>`.
- `put(input:PendingSeek): Promise<void>` — một pending seek hiện hành mỗi target tab.
- `remove(input:{tabId:number;requestId:string}): Promise<void>` — chỉ xóa nếu request hiện hành khớp.
- `list(): Promise<PendingSeek[]>` — phục hồi và dọn request hết hạn khi worker nhận event, không keepalive.

`PendingSeek` dùng fields spec, `expiresAt` ISO; có `documentId`, `documentToken`, `generation` nullable trước handshake. `targetTabId` là key; request cũ không thể xóa request mới.

### Wire protocol — Task 4 owns definition

User command `op` trùng tên repository methods công khai ở trên, không expose PendingSeekStore. Bổ sung:

- `getPanelContext({windowId:number}): Promise<PanelContext>`.
- `capturePlayer({binding:PlayerBinding}): Promise<PlayerSnapshot>`.
- `seekFromPanel({binding:PlayerBinding;timestampSeconds:number}): Promise<void>`.
- `seekFromNotebook({windowId:number;videoId:string;timestampSeconds:number}): Promise<void>`.
- `openNotebook({windowId:number;notebookId?:string}): Promise<void>`.

`UserCommand` là discriminated union `{ op, payload }` với payload đúng input từng method. `Request = UserCommand & {version:1;requestId:string}`; `Reply = {version:1;requestId:string;op:UserCommand["op"]} & ({ok:true;result:unknown}|{ok:false;error:{code:FailureCode;message:string}})`. Client narrow result bằng command/result map trong `protocol.ts`, không cast payload tùy tiện tại call sites.

`Invalidation = {version:1;op:"invalidate";videoIds:string[];notebookIds:string[]}`; subscription không thay authoritative reads.

Content reports riêng `{version:1;op:"player.report";payload:PlayerReport}`. Worker→content chỉ `player.capture` và `player.seek`, có request ID và expected document token/generation/video ID; seek kèm timestampSeconds và expiresAt ISO. Reply echo các identity fields. Content entry sở hữu AbortController cho seek hiện hành, hủy khi request mới/navigation/dispose hoặc hết expiresAt. Không có giao thức nhận từ `window.postMessage`.

## Task 1: Domain identity, validation và toolchain cho kiểm thử

**Files:** Create toolchain configs/package/lockfile, `src/domain/types.ts`, `identity.ts`, `library.ts`, `tests/domain.test.ts`, `tests/fixtures.ts`; update `.gitignore` và `AGENTS.md` với scripts thực tế. Chưa tạo UI rỗng để gọi là extension hoạt động.

**Interfaces:** Consumes approved spec. Produces domain types/Clock ở trên; `parseVideoId(url:URL): string|null`, `watchUrl(videoId:string): string`, `sameBinding(a:PlayerBinding,b:PlayerBinding): boolean`, `formatTimestamp(seconds:number): string`, `resolveSeekTarget(snapshot:PlayerSnapshot,seconds:number): number`, `validateNotebookName(name:string): string`, `validateNoteText(text:string): string`, `searchNotebook(snapshot:NotebookSnapshot,query:string,videoId?:string): Array<{video:VideoEntry;notes:Note[]}>`.

- [ ] **Step 1:** Viết test các boundary domain trước implementation: watch URL bỏ qua playlist/tracking; non-watch/invalid ID bị từ chối; A→B→A khác generation không cùng binding; timestamp 80.9 giữ dữ liệu nhưng hiển thị `01:20`; finite/nonnegative seek và khoảng khả dụng; tên 120/121, note 50.000/50.001, whitespace; sort ổn định và Unicode search giữ dấu. Fixture factory chỉ dành test, deterministic; không ship demo notes.

```ts
expect(parseVideoId(new URL('https://www.youtube.com/watch?v=abcdefghijk&list=PL1'))).toBe('abcdefghijk');
expect(parseVideoId(new URL('https://www.youtube.com/shorts/abcdefghijk'))).toBeNull();
expect(formatTimestamp(80.9)).toBe('01:20');
expect(() => validateNotebookName('x'.repeat(121))).toThrow();
expect(() => validateNoteText('x'.repeat(50_001))).toThrow();
```

- [ ] **Step 2:** Tạo package scripts `typecheck: tsc --noEmit`, `test: vitest run`, cấu hình test Node/fake-indexeddb theo file. Gửi người dùng `node --version` và `npm --version` trước khi chọn dependency versions; đối chiếu engine compatibility bằng metadata công khai. Gửi lệnh `npm install --save-dev --save-exact typescript vite vitest fake-indexeddb @types/chrome @resvg/resvg-js fflate` chỉ sau khi bảo đảm versions đã chọn hỗ trợ Node thực tế; dùng versions tường minh nếu engines yêu cầu. Không tự chạy hoặc tự tạo lockfile bằng phỏng đoán; npm do người dùng chạy tạo lockfile.
- [ ] **Step 3:** Người dùng chạy `npm test -- tests/domain.test.ts`. Expected RED: exports/implementations chưa tồn tại; sau đó triển khai các signatures trên. Không coi lỗi thiếu npm/dependency là RED có ý nghĩa; giải quyết setup trước.
- [ ] **Step 4:** Người dùng chạy lại targeted test và `npm run typecheck`; Expected GREEN: assertions boundary đúng, exit 0. `validateNoteText` chỉ từ chối blank/over-limit, không trim nội dung note được lưu; search normalize bản so sánh, không sửa note gốc.
- [ ] **Step 5:** Checkpoint source + output do người dùng báo; ghi README ban đầu đúng domain/tooling đã có, không quảng bá UI chưa viết. Nếu người dùng muốn checkpoint Git, gửi danh sách file và commit message `feat: define notebook domain invariants`; không tự commit.

## Task 2: Transactional notebooks, notes và nháp bền vững

**Files:** Create `src/storage/database.ts`, `repository.ts`, `pending-seeks.ts`, `tests/repository.test.ts`; extend `tests/fixtures.ts` để mở database riêng mỗi test và đóng/xóa sau test. Modify `README.md` về dữ liệu local và giới hạn.

**Interfaces:** Consumes Task 1 types, validation, Clock. Produces toàn bộ Repository/PendingSeekStore signatures trong Shared interfaces; dùng database schema 1, stores `notebooks`, `videos`, `notes`, `drafts`, `pendingSeeks`. Index `videos.notebookId`, `notes.videoId`, `drafts.videoId`, `drafts.writerId`; key pendingSeeks là targetTabId.

- [ ] **Step 1:** Viết failing behavioral tests cho create/rename/assign/move, note+draft atomicity, multiple writers, expected revision, restore/rebind, edit/delete conflict, idempotent retry và schema refusal. Các assert quan trọng dùng repo thực với fake-indexeddb, không mock lời gọi persistence.

```ts
const saved = await repo.commitDraft({ draft });
expect(saved.id).toBe(draft.id);
expect(await repo.commitDraft({ draft })).toEqual(saved); // reply đầu bị mất
const state = await repo.readVideo({ videoId: draft.videoId });
expect(state.notes).toEqual([saved]);
expect(state.drafts).toEqual([]);
```

Test abort trước transaction complete phải chứng minh note không được tạo **và** draft vẫn giữ nguyên; update title không tăng video revision; move từ cửa sổ khác khiến commit stale fail nhưng draft vẫn đọc được. Restore giữ text/time, không cho writer cũ overwrite bản mới. Replay update `putDraft` với expectedRevision dương sau commit/discard phải conflict nếu draft không còn; không dùng upsert vô điều kiện. Client không tự retry mutations. Final-save retry được bảo vệ bằng note ID/payload; không thêm tombstone/general retry engine ngoài phạm vi.

- [ ] **Step 2:** Người dùng chạy `npm test -- tests/repository.test.ts`; Expected RED từ hành vi chưa triển khai.
- [ ] **Step 3:** Implement database/repository signatures bằng native IndexedDB. Resolve command chỉ ở transaction `complete`, reject `abort/error`; không await Chrome/network trong transaction. `commitDraft` kiểm tra mọi expected revision và bản snapshot trước khi ghi note/xóa đúng draft. Retry create sau khi draft đã xóa chỉ thành công nếu note cùng ID/payload đã có; payload khác báo CONFLICT. Edit retry không được ghi đè revision mới.
- [ ] **Step 4:** Implement open `blocked/versionchange/error` và migration refusal: đóng connection khi versionchange, lỗi schema mới chặn ghi, không tự xóa database. Pending seek remove phải compare request ID; request hết hạn được dọn nhưng note/draft không bị chạm tới. Các failure thực tế map STORAGE_FAILED/SCHEMA_UNSUPPORTED; không fake fallback database rỗng.
- [ ] **Step 5:** Người dùng chạy targeted tests và typecheck; Expected GREEN cho rollback, retry, concurrency và schema boundaries. Ghi output thực; Chrome persistence qua reload/worker restart còn chờ smoke Task 8. Checkpoint message gợi ý: `feat: persist notebooks and recoverable drafts transactionally`.

## Task 3: YouTube player binding và seek an toàn

**Files:** Create `src/content/player.ts`, `src/content/index.ts`, `tests/navigation.test.ts`; extend domain identity seek helpers nếu cần đúng interface; update README giới hạn YouTube.

**Interfaces:** Consumes PlayerReport/PlayerSnapshot/PlayerBinding, sameBinding/resolveSeekTarget. Produces `inspectPage(doc:Document,url:URL): PageInspection`, `createPlayerObserver(doc:Document,onReport:(report:PlayerReport)=>void): {capture():PlayerReport;dispose():void}`, `seekPlayer(input:{getCurrentReport:()=>PlayerReport;expected:Pick<PlayerBinding,"documentToken"|"generation"|"videoId">;timestampSeconds:number},media:HTMLVideoElement,signal:AbortSignal): Promise<void>`; content entry chỉ nối observer với Chrome runtime. Callback lấy report hiện hành để kiểm tra lại sau await, không giữ snapshot cũ làm authority.

- [ ] **Step 1:** Thêm test pure binding/range decisions trong `tests/navigation.test.ts`: URL A→B→A dùng generations 1/2/3, request generation 1 bị từ chối dù video ID lại A; NaN/Infinity/negative time bị từ chối; điểm vượt duration được clamp vào seekable range. Ad/live/loading/unavailable không tạo valid capture hoặc seek.

```ts
expect(sameBinding({ ...bindingA, generation: 1 }, { ...bindingA, generation: 3 })).toBe(false);
expect(() => resolveSeekTarget({ ...readySnapshot, status: 'ad' }, 80)).toThrow();
expect(() => resolveSeekTarget(readySnapshot, Number.NaN)).toThrow();
```

`bindingA` và `readySnapshot` là fixture trong tests/fixtures.ts, không metadata giả trong runtime.

- [ ] **Step 2:** Người dùng chạy `npm test -- tests/navigation.test.ts`; Expected RED cho guards chưa có; sau đó implement observer/inspection. Dùng URL + player thực tế làm authority, metadata DOM chỉ chấp nhận khi khớp video hiện tại. Sự kiện YouTube và MutationObserver phạm vi player đánh thức cùng một reconciliation, cleanup khi player thay; không timer poll toàn DOM.
- [ ] **Step 3:** `seekPlayer` gọi getCurrentReport để kiểm tra identity/status trước và sau chờ metadata, pause rồi set currentTime; ACK chỉ sau seek hoàn tất và identity vẫn khớp. Không ghi timestamps từ quảng cáo; nghi ngờ player identity thì PLAYER_UNAVAILABLE, không đoán. Thời hạn Task 4 gửi qua expiresAt; content entry abort signal khi hết hạn/request thay thế/navigation và mọi đường settle đều dọn listeners.
- [ ] **Step 4:** Content message handler chỉ nhận sender cùng extension và đúng schema/request identity; không nghe window messages, không notebook CRUD. Report chỉ metadata đang cần cho panel; không persist watch history.
- [ ] **Step 5:** Người dùng chạy targeted tests/typecheck; ghi rõ test pure guards không chứng minh YouTube DOM thật. Sau build Task 7, người dùng sẽ smoke watch/SPA/ad/live, kết quả đi vào Task 8. Checkpoint message gợi ý: `feat: bind note timestamps to the current YouTube player`.

## Task 4: Worker authentication, window-local routing và durable seeks

**Files:** Create `src/shared/protocol.ts`, `src/background/handlers.ts`, `tabs.ts`, `index.ts`, `src/ui/client.ts`, `tests/security.test.ts`; extend `tests/navigation.test.ts` cho coordination transitions.

**Interfaces:** Consumes Repository/PendingSeekStore và content interfaces. Produces typed CommandMap/Request/Reply/Invalidation và `createClient(): {call<K extends keyof CommandMap>(op:K,payload:CommandMap[K]["input"]):Promise<CommandMap[K]["output"]>;subscribe(onChange:(event:Invalidation)=>void):()=>void}`. Client không tự retry mutation; transport failure giữ input để người dùng quyết định thử lại.

Trong `tabs.ts`, `createTabCoordinator(input:{chromeApi:Pick<typeof chrome,"tabs"|"windows">;pendingSeeks:PendingSeekStore;clock:Clock;extensionId:string}): TabCoordinator`. TabCoordinator có `getPlayerContext({windowId:number}):Promise<Pick<PanelContext,"windowId"|"tabId"|"videoId"|"binding"|"player"|"status">>`, `capturePlayer`, `seekFromPanel`, `seekFromNotebook`, `openNotebook` với input/output như Shared interfaces; `acceptReport(report:PlayerReport,sender:chrome.runtime.MessageSender):void`, `onTabRemoved(tabId:number):Promise<void>`, `reconcilePending():Promise<void>`. Chỉ acceptReport nhận content reports đã validate.

Trong `handlers.ts`, `createBackgroundHandlers(input:{repository:Repository;tabs:TabCoordinator;extensionId:string;notify:(change:Invalidation)=>void}): {handleRequest(request:unknown,sender:chrome.runtime.MessageSender):Promise<Reply>}`. getPanelContext compose player context với listNotebooks/readVideo; mutation success mới notify. `index.ts` tạo factory với Chrome thật và repo; tests dùng database riêng và tab coordinator test, không đổi singleton/global production.

- [ ] **Step 1:** Failing tests cho consumer-visible security boundaries: content script gọi createNotebook bị UNAUTHORIZED và dữ liệu không thay đổi; sender khác extension/subframe/non-YouTube bị từ chối; nonfinite timestamps/unsafe URL fields không tới mutation. Đây không phải test mock-forwarding; assert kết quả dữ liệu/error thật.

```ts
const reply = await handleRequest(createNotebookRequest, youtubeContentSender);
expect(reply.ok).toBe(false);
expect(reply.ok ? undefined : reply.error.code).toBe('UNAUTHORIZED');
expect(await repo.listNotebooks()).toEqual([]);
```

Fixtures `createNotebookRequest`, `youtubeContentSender` được định nghĩa trong test. Setup lấy `handleRequest` từ `createBackgroundHandlers({repository:repo,tabs,extensionId,notify})` với database test riêng; không dùng database profile thật. Tab adapter của coordination tests mô phỏng tab events/state, tests assert lựa chọn tab/không điều hướng đè và request cancellation, không assert mock echoes.

- [ ] **Step 2:** Failing coordination tests: panel ở window 1 không đổi theo active tab window 2; stale document/generation reply bị bỏ; notebook seek dùng matching tab trong cùng window theo active/index; không có match thì create mới thay vì navigate đè; pending request 1 ACK không remove request 2; expired/restarted request không seek tab đã đổi video. Người dùng chạy `npm test -- tests/security.test.ts tests/navigation.test.ts`; Expected RED đúng guard/state transition.
- [ ] **Step 3:** Implement schema/sender guards: Chrome sender cung cấp window/tab/documentId, content report không tự khai các quyền đó. Allowlist user pages là `sidepanel.html`, `notebook.html` cùng extension origin; chỉ chúng gọi mutations. Error hữu hạn + copy Việt an toàn, không gửi stack/private text không cần thiết.
- [ ] **Step 4:** Implement routing/pending persistence: tạo pending trước khi đợi player handshake; `expiresAt = now + 15.000ms`. Existing bindings mất khi worker ngủ phải lấy handshake mới, không tái dùng registry cũ. Mỗi event/reconnect kiểm tra pending chưa hết hạn; timer nếu còn sống chỉ hỗ trợ UX, không là authority. Điều khiển đúng tab/document qua tabs messaging; abort mismatched navigation/closed tab. Mất ACK không được báo đã seek; request mới hủy ý định cũ trên cùng target tab.
- [ ] **Step 5:** Register top-level runtime/tab listeners, action `setPanelBehavior({openPanelOnActionClick:true})`, invalidation sau commit. Không tự mở panel khi load trang. Client có request IDs và response correlation, đọc lại snapshot khi focus/reconnect; mutation lỗi giữ input. Notebook tab reuse chỉ trong window yêu cầu; không cần quyền `tabs` rộng.
- [ ] **Step 6:** Người dùng chạy targeted tests/typecheck; Expected GREEN. README cập nhật cách mở panel, reload YouTube sau cài, không global N shortcut, lỗi chưa có content script. Checkpoint message gợi ý: `feat: coordinate authenticated panel and notebook actions`.

## Task 5: Panel ghi chú và editor không mất nháp

**Files:** Create `sidepanel.html`, `src/domain/editor.ts`, `src/ui/shared.ts`, `shared.css`, `src/panel/controller.ts`, `view.ts`, `index.ts`, `tests/editor.test.ts`; modify README cho luồng ghi.

**Interfaces:** Consumes client, PanelContext, domain types. Produces `createEditorSession(): EditorSession` trong editor.ts; interface `bind(context:PanelContext):void`, `start(snapshot:PlayerSnapshot,draft:Draft):void`, `startEdit(draft:Draft):void`, `changeText(text:string):void`, `settleDraft(input:{draftId:string;localVersion:number;draft?:Draft;error?:AppError}):void`, `beginSave():Draft|null`, `settleSave(input:{draftId:string;draftRevision:number;binding:PlayerBinding|null;note?:Note;error?:AppError}):void`, `snapshot():EditorState`.

`EditorState = {binding:PlayerBinding|null;draft:Draft|null;localVersion:number;acknowledgedLocalVersion:number;saving:boolean;error:AppError|null}`. Draft text có thể phản ánh input mới trong khi draft.revision vẫn là DB revision đã xác nhận; settleDraft cập nhật revision nhưng không ghi đè text của localVersion mới hơn. beginSave chỉ trả immutable snapshot khi localVersion đã được ACK. startEdit dùng draft noteId/expectedNoteRevision và binding null, không cần player/network để sửa note cũ trong panel hoặc notebook.

`mountPanel(root:HTMLElement,client:ReturnType<typeof createClient>): {dispose():void}` trong controller.ts. View giữ editor DOM sống qua updates, render safe text; shared.ts có `setStatus(el:HTMLElement,text:string,kind:"info"|"error"):void` và `confirmAction(message:string):Promise<boolean>` bằng dialog local truy cập được bàn phím.

- [ ] **Step 1:** Failing editor-state tests: bắt đầu tại 80.9 giây, text thay đổi/lưu muộn vẫn giữ timestamp; ack video A không đổi draft B; save failure giữ text/time; read-only chỉ lúc snapshot save chưa settle; stale draft ack không thay local text mới; focus lại không bắt đầu nháp mới. Restore sau membership change không tự rebind; cancel confirmation giữ nguyên dữ liệu.

```ts
session.start(snapshotAt80Point9, draftAt80Point9);
session.changeText('Điều mình hiểu');
expect(session.beginSave()).toBeNull(); // chưa được ACK nội dung mới
session.settleDraft({ draftId: draftAt80Point9.id, localVersion: 1, draft: { ...draftAt80Point9, text: 'Điều mình hiểu', revision: draftAt80Point9.revision + 1 } });
const intent = session.beginSave();
expect(intent?.timestampSeconds).toBe(80.9);
session.settleSave({ draftId: intent!.id, draftRevision: intent!.revision, binding: snapshotAt80Point9.binding, error: storageError });
expect(session.snapshot().draft?.text).toBe('Điều mình hiểu');
```

Fixtures tạo tại tests/fixtures.ts. `beginSave` chỉ có intent khi local input đã được ghi/ACK vào đúng draft revision; controller đợi hàng đợi putDraft hoàn tất, không commit bản DB cũ.

- [ ] **Step 2:** Người dùng chạy `npm test -- tests/editor.test.ts`; Expected RED; implement session/controller. Mỗi input được queue tuần tự tới putDraft; ack cập nhật durable revision nhưng không reassign textarea nếu user đã gõ tiếp. Tab switch giữ bản chưa commit trong state theo binding để báo/khôi phục nếu write lỗi, không vứt buffer khi mount video mới.
- [ ] **Step 3:** Implement panel đầy đủ: loading/unsupported/reload-required, chọn/tạo/đổi sổ có xác nhận, list note, ghi mới, edit/delete, restore nhiều writer, rebind stale draft có xác nhận, lỗi/pending statuses. Chọn sổ thành công trước khi editor nhận input. Chỉ read-only editor lúc final save; không blur/dựng lại node. Discard có chữ cần confirm. Edit chỉ text, không đổi timestamp.
- [ ] **Step 4:** Cmd/Ctrl+Enter chỉ từ editor và `!event.isComposing`, bảo vệ keyCode 229 nếu engine báo composition legacy; Enter/N/Space bình thường. Không gửi save giữa composition. Timestamp click dùng binding đang render, không truy vấn tab global rồi seek thiếu identity.
- [ ] **Step 5:** Người dùng chạy targeted editor tests/typecheck. Sau build Task 7, gửi checklist nhập tiếng Việt, composition, 320px, long text, narrow height, keyboard/focus, status lỗi và light/dark. Không thêm DOM snapshot/copy tests để thay smoke thật. Checkpoint message gợi ý: `feat: add recoverable timestamped notes in the side panel`.

## Task 6: Cuốn sổ đọc/tìm nhiều video

**Files:** Create `notebook.html`, `src/notebook/controller.ts`, `view.ts`, `index.ts`; extend domain search tests khi có boundary chưa covered; update shared UI và README theo bề mặt thật.

**Interfaces:** Consumes listNotebooks/readNotebook, searchNotebook, renameNotebook, edit/delete methods và seekFromNotebook/openNotebook. Produces `mountNotebook(root:HTMLElement,client:ReturnType<typeof createClient>): {dispose():void}`. Filter state `{notebookId:string|null;videoId:string|null;query:string}` được controller sở hữu; editor dùng cùng createEditorSession nhưng không giả player capture khi sửa note cũ.

- [ ] **Step 1:** Bổ sung failing domain search boundary (nếu chưa covered ở Task 1): `"ghi chú"` NFD khớp `"Ghi chú"` NFC; `"chu"` không khớp `"chú"`; query rỗng giữ video filter; video trùng title không ghép note; same timestamp sắp createdAt rồi ID. Người dùng chạy `npm test -- tests/domain.test.ts` để thấy RED; không tạo duplicate assertion cho đường đã covered.
- [ ] **Step 2:** Implement trang đọc: tạo/chọn/đổi tên sổ, list video theo addedAt, đọc toàn sổ hoặc một video, query chỉ trong note sổ đang chọn; empty/error/loading states. Nếu notebook cũ không tồn tại, báo NOT_FOUND và cho chọn lại, không tự tạo sổ thay thế.
- [ ] **Step 3:** Group kết quả theo video ID, hiển thị nguyên note, timestamp và link canonical. Render text qua textContent; newline/long text wrap. Note có `<script>` hoặc `<img onerror>` hiển thị như chữ, không HTML. Không tải thumbnail/network assets. Sửa/xóa giữ revision conflict và working draft như Task 5.
- [ ] **Step 4:** Khi invalidation/focus, đọc snapshot mới nhưng giữ filter và text/selection của editor; không để kết quả search cũ thay snapshot của sổ mới. Bấm timestamp dùng cửa sổ của trang đọc, mở/focus đúng video, không điều hướng đè tab khác. Lỗi video private/offline không xóa note.
- [ ] **Step 5:** Người dùng chạy tests liên quan/typecheck, sau build smoke hai sổ/ba video, đọc/tìm, titles trùng, long note/HTML literal, và stale search replies. Expected: không lẫn sổ/video, không chạy HTML, không mất bản đang edit. Checkpoint message gợi ý: `feat: add notebook reading and Vietnamese note search`.

## Task 7: Build extension hoàn chỉnh và GitHub ZIP

**Files:** Create `manifest.json`, `assets/icon.svg`, `scripts/build.mjs`, `scripts/pack.mjs`, `.github/workflows/ci.yml`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, `RELEASING.md`; modify package scripts, vite config, README, AGENTS, .gitignore. Không tạo workflow publish hoặc Store metadata.

**Interfaces:** Consumes runtime entry files của Tasks 3–6. Produces `npm run build` → loadable `dist/`, `npm run pack` → `artifacts/chudin-note-youtube-0.1.0.zip`; version ban đầu `0.1.0` đồng nhất package/manifest, tag tương lai `v0.1.0`. `pack` chỉ đóng gói build đã có, không tự che stale build bằng một build ngầm; docs yêu cầu build trước pack.

- [ ] **Step 1:** Implement build bằng Vite programmatic API: app multi-entry `sidepanel.html`, `notebook.html`, background ESM output `service-worker.js`; content script build riêng dạng IIFE `content.js`, `emptyOutDir:false`, không shared ESM imports trong content script. JS/CSS target Chrome 116; không dev server/HMR runtime.
- [ ] **Step 2:** Manifest action + side_panel.default_path `sidepanel.html`; background `service-worker.js`, type module; static content script `content.js` trên https://www.youtube.com/*, top frame, `document_idle`; min Chrome 116, incognito not_allowed, CSP self-only. Icon SVG source render local PNG 16/32/48/128 bằng @resvg/resvg-js. Build kiểm tra version equality trước copy manifest; không remote code hoặc inline execution.
- [ ] **Step 3:** Pack bằng fflate, recursive allowlist runtime assets từ dist, reject symlinks/path traversal/missing entry/version mismatch. ZIP root có manifest.json, không bọc thêm folder; không .git, .env, source, node_modules, tests, plans, sourcemaps hoặc local tooling. Ignore `artifacts/` và generated output trong Git.
- [ ] **Step 4:** Tạo MIT LICENSE với copyright `2026 Chudin Note for YouTube contributors`; giữ attribution nếu thực sự reuse mã tham chiếu. README hướng dẫn clone/npm ci/typecheck/test/build/pack/cài unpacked/update đúng folder, data-loss warning, quyền, API floor vs tested versions, giới hạn fullscreen/ad/live/no backup. CONTRIBUTING yêu cầu sanitized fixtures/bug reports. RELEASING không gỡ/cài lại extension để update, chỉ GitHub manual release sau khi có smoke evidence.
- [ ] **Step 5:** CI pull_request/push chạy npm ci, typecheck, tests, build và pack, upload ZIP artifact bằng GitHub Actions. Không token publish, không auto-tag/release/Store, không tự chạy CI ở máy người dùng. Commands dự kiến cuối: `npm run typecheck`, `npm test`, `npm run build`, `npm run pack`.
- [ ] **Step 6:** Gửi người dùng các commands đó và `unzip -l artifacts/chudin-note-youtube-0.1.0.zip` trên macOS; Expected: exit 0, manifest/HTML/worker/content/icons/assets đúng, không private files. Hướng dẫn họ tự Load unpacked dist; chưa coi build pass là extension dùng được. Checkpoint message gợi ý: `build: package the GitHub-distributed Chrome extension`.

## Task 8: Human-operated smoke và đối chiếu acceptance

**Files:** Create `docs/TESTING.md`; modify README/CHANGELOG/RELEASING/AGENTS theo bằng chứng thực tế. Sửa đúng runtime/test files nếu người dùng báo failure; không chạy lại chỉ để xác nhận lời người dùng.

**Interfaces:** Consumes loadable dist/ZIP, commands thực tế và toàn bộ 13 acceptance criteria của spec. Produces checklist có trạng thái `CHƯA CHẠY`, `NGƯỜI DÙNG BÁO PASS`, `NGƯỜI DÙNG BÁO FAIL`, kèm Chrome/OS/version/output; không coi source review là PASS runtime.

- [ ] **Step 1:** Gửi lệnh kiểm tra tổng hợp cho người dùng: `npm run typecheck && npm test && npm run build && npm run pack`; yêu cầu nguyên error/output nếu fail, không gửi dữ liệu note riêng. Chưa có execution output thì tất cả status vẫn CHƯA CHẠY.
- [ ] **Step 2:** Gửi checklist Chrome theo batch nhỏ; người dùng tự dùng Chrome profile thử nghiệm chỉ có note mẫu, Load unpacked và reload tab YouTube mở sẵn. Batch đầu: icon mở panel, hai sổ/ba video, timestamp bắt đầu khác lúc lưu, IME/newline/N/shortcut, đọc/tìm và timestamp seek. Ghi kết quả thực từng bước.
- [ ] **Step 3:** Batch persistence/concurrency: đóng/mở panel, restart Chrome, SPA A→B→A, hai tab/hai cửa sổ, draft nhiều writer, chuyển sổ, sửa/xóa conflict, worker restart và seek đang chờ. Chỉ người dùng dừng worker/reload trang qua DevTools hoặc UI Chrome, trợ lý không điều khiển thay.
- [ ] **Step 4:** Batch failure/layout: người dùng thử private/unavailable/offline, ad/live/unsupported, 320px/light/dark/short height/focus/long literal HTML note. Với lỗi transaction, gửi vị trí breakpoint và thao tác `transaction.abort()` trong DevTools **của test profile** sau khi code thực tế tồn tại; không cài debug command/endpoint vào production build, không phá database thật để tạo lỗi.
- [ ] **Step 5:** Người dùng thử ZIP từ clean checkout và cập nhật bản build trong cùng folder bằng Reload, không remove extension. Đối chiếu version/artifact contents; không hứa dữ liệu sống qua extension ID/profile khác. Ghi mọi acceptance chưa thử, không tuyên bố toàn bộ extension hoàn tất khi còn thiếu kiểm chứng cốt lõi.
- [ ] **Step 6:** Mỗi failure có thực tế do người dùng báo là đầu vào debugging: giữ steps/error, thêm regression cho boundary nếu cần, sửa source, gửi targeted command/Chrome steps để họ xác nhận sau sửa. Khi tất cả tiêu chí đủ bằng chứng, cập nhật trạng thái release-ready; chỉ gửi Git commands/release steps nếu người dùng yêu cầu, không chạy chúng. Checkpoint message gợi ý: `docs: record user-verified extension acceptance`.

## Coverage and execution handoff

- Spec 1–3 (intent/choices/scope): Tasks 1–8; không bỏ sửa/xóa, search hoặc draft để gọi là MVP.
- Spec 4 (flows): storage Task 2, player Task 3, routing Task 4, panel Task 5, notebook Task 6.
- Spec 5 (UI/accessibility/states): Tasks 5–6 và human smoke Task 8.
- Spec 6–7 (architecture/data/security/lifecycle/privacy): Tasks 1–4 và manifest Task 7; human restart/failure evidence Task 8.
- Spec 8 (open source/GitHub): Task 7; cài/nâng cấp thực tế Task 8.
- Spec 9 acceptance 1–13: Task 8 checklist; targeted regressions do module owners Tasks 1–6 bảo vệ.
- Không có step cleanup được dùng để trì hoãn chức năng; temporary probes nếu phát sinh khi smoke không được ship trong ZIP.

**Cách triển khai đã chọn:** Native trong phiên này; trợ lý giữ integration ownership và tự chạy build tooling. Người dùng tự cài/thử Chrome. Không tự commit/push/publish hoặc chuyển sang browser automation. Khi thiếu bằng chứng Chrome, bàn giao build thật kèm checklist cụ thể và đánh dấu nghiệm thu browser đang chờ.
