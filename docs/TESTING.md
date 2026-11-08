# Kiểm chứng

## Kiểm tra bản phát hành thủ công — 0.2.0 Unreleased

Người dùng duyệt nút xem phiên bản đang cài, kiểm tra GitHub theo yêu cầu và mở trang tải khi có bản mới; không auto-update. Nút nằm ở cuối panel và Cuốn sổ, không remount editor hoặc tự chạy khi mở/focus giao diện. Worker chỉ nhận từ trang extension hợp lệ (panel cần phiên đã attach), payload phải rỗng; không có fetch bridge từ YouTube. Không đổi schema/notes.

Trước triển khai, hai suite mới RED vì chưa có module release-check; ca kiểm tra command qua phiên panel cũng RED vì chưa có lệnh được hỗ trợ. Sau tích hợp: `npm run typecheck` exit 0, `npm test` **259/259 tests trong 19 files**, build/pack và `unzip -t artifacts/chudin-note-youtube-0.2.0.zip` pass, 16 runtime files. Bao phủ so sánh số phiên bản, tag/asset không an toàn, draft/prerelease, HTTP404/403/429/500, network/JSON/timeout fetch và body, không tự gọi mạng, single-flight, link cũ sau lỗi, retry thủ công, dispose và giữ nháp/focus.

Command-line smoke Node/jsdom + fake-indexeddb chạy **built sidepanel.js và notebook.js cùng service-worker.js thật** qua transport/auth adapter. Cả hai hiện installed 0.2.0, không gọi GitHub khi mount, double click chỉ một lượt, có link chính thức khi available, mất mạng xóa link cũ và cho thử lại, current không có link, pagehide dispose. Panel dùng textarea/editor thật đang có nháp; chữ và DOM focus vẫn giữ sau kiểm tra. Đây không phải native keyboard/focus hoặc kiểm tra thị giác Chrome.

Lần gọi public API GitHub thật trả **HTTP403 do rate limit**; giao diện hiển thị lỗi, không báo “mới nhất”. Đọc metadata v0.1.0 thực bằng CLI đã xác thực rồi dùng snapshot JSON ở boundary fetch trong smoke cho cả hai surface: nhận đúng asset và trạng thái build 0.2.0 mới hơn bản công khai. Credential CLI chỉ dùng cho công cụ kiểm chứng, không đưa vào extension/artifact. **Chưa chứng minh request 200 từ extension/Chrome thật.** Test thành công với snapshot không thay cho bằng chứng đó.

Review source độc lập không phát hiện lỗi. Mechanical UI detector chạy một lần và trả `[]`, không chứng nhận pixel/contrast/native layout. Host permission mới là `https://api.github.com/*`; CSP chỉ mở connect-src API GitHub. Request không chứa note/nháp/video ID/cookie/auth/referrer; không polling, retry nền hoặc tải mã thực thi. Bản v0.1.0 đã phát hành không bị ghi đè. Sau triển khai, chủ repo yêu cầu commit/push source 0.2.0; yêu cầu này không gồm tag hoặc GitHub Release 0.2.0. Trước commit đã chạy lại typecheck, 259 tests, build/pack/unzip và smoke hai surface từ ZIP qua adapter như trên; chưa có nghiệm thu Chrome riêng cho nút mới.

Người dùng kiểm tra Chrome:
1. Reload đúng extension đang load `dist/`, cho phép host API GitHub nếu Chrome yêu cầu, rồi tải lại YouTube; không Remove/đổi folder/ID/profile.
2. Mở panel hoặc Cuốn sổ, kéo xuống cuối: thấy phiên bản 0.2.0 và **Kiểm tra bản phát hành**. Mở giao diện không tự gọi API. Bấm nút: chờ → kết quả hoặc lỗi có thể thử lại.
3. Bản công khai hiện v0.1.0, nên build 0.2.0 có thể báo mới hơn bản phát hành; không được gợi ý tự cài/downgrade. GitHub rate limit/mất mạng phải báo lỗi, không nói đã mới nhất.
4. Giữ một nháp đang nhập, kiểm tra rồi quay lại: chữ/mốc không đổi. Thử panel hẹp, sáng/tối, bàn phím và tab Cuốn sổ. Nếu có bản công khai mới hơn hợp lệ sau này, liên kết phải mở đúng trang Release; người dùng tự tải ZIP và cập nhật cùng folder.

## Kiểm tra gói phát hành v0.1.0 — 2026-11-08

Chủ repo yêu cầu phát hành GitHub Release v0.1.0 kèm ZIP; không yêu cầu Store hoặc auto-update. Trước cập nhật release metadata, working tree ở commit `bbf9ea670098fe6496adbfa5537c7ed9294966de` sạch và đồng bộ origin/main. Chạy từ lockfile bằng `npm ci` (87 packages), typecheck exit 0, **221/221 tests trong 17 files**, build/pack/unzip integrity/list pass. Đây là working tree hiện có, không phải một clean clone độc lập hoặc bằng chứng CI Linux.

ZIP `artifacts/chudin-note-youtube-0.1.0.zip` gồm 16 runtime files, manifest version 0.1.0 và LICENSE; không source, node_modules, credentials hay note dữ liệu. SHA256: `e769aa949c0ad37e9029fa492a4dfded58652a3b3bdb8fa9ac360357a6cdada1`.

Giải nén ZIP vào thư mục tạm và chạy worker/content bundle thật bằng Node/jsdom + fake-indexeddb: home→A→B→A với URL nguồn giữ `/`, private grant/attach, context ready, note A không lẫn sang B và vẫn đọc lại được, quick pause B, stale seek/quick A bị từ chối; giữ cùng panel frame. Đây là command-line smoke trên chính file trong ZIP, không phải cài ZIP vào Chrome hoặc chứng nhận native editor/focus.

Người dùng đã xác nhận Chrome hoạt động ổn sau bản sửa URL như ghi nhận bên dưới. Phiên bản Chrome cụ thể, cài ZIP trên profile mới và nâng cấp ZIP giữ note/nháp chưa có báo cáo riêng. Release notes phải nêu những giới hạn này, dữ liệu local không có backup/export, và cập nhật unpacked là thủ công vào cùng folder/extension ID/profile.

## Sửa nhận diện URL sau chuyển trang nội bộ — 2026-11-08

Người dùng báo panel vẫn lỗi sau reload. Chẩn đoán do người dùng tự chạy trong Chrome cho thấy worker trả `UNAUTHORIZED`; extension/top-frame/document/active/tab/window đều hợp lệ, nhưng URL nguồn có path `/`, trong khi URL tab có path `/watch` và video ID hợp lệ. Đây là bằng chứng Chrome của ca lỗi, không phải bằng chứng đã nghiệm thu bản sửa.

Bản sửa dùng URL hiện tại từ `sender.tab.url` cho nhận diện video trong session, quick note, handler `player.report` và coordinator. Chỉ fallback sang URL nguồn khi Chrome không cung cấp URL tab; URL tab không hỗ trợ/hỏng không được fallback về video cũ. Nguồn vẫn phải là top-frame YouTube; giữ các kiểm tra extension/document/tab/window/session/generation. Worker failure được hiển thị như plain text thay vì che bằng thông báo reload chung. Không đổi schema, permissions hay dữ liệu.

Trước sửa, suite SPA mới có 7 ca FAIL: home→watch, watch A→B, report video cũ và từ chối fallback khi tab hiện tại là home/Shorts/foreign/malformed. Smoke built-content với worker lỗi schema cũng FAIL vì thông báo cụ thể bị che. Sau sửa: `npm run typecheck` exit 0; `npm test` **221/221 tests, 17 files**; `npm run build`, `npm run pack`, `unzip -t artifacts/chudin-note-youtube-0.1.0.zip` pass, ZIP gồm 16 runtime files.

Command-line smoke Node/jsdom + fake-indexeddb chạy **built content.js và service-worker.js thật**, nguồn giữ path `/` xuyên suốt home→A→B→A: private grant/attach, player context ready, lưu note của A và không thấy note đó ở B, trở lại A đọc đúng note/mốc; quick pause trên B; seek/quick pause cũ của A bị từ chối; giữ cùng iframe. Boundary Chrome transport/media/shadow-iframe được adapter, **không chạy sidepanel editor, Chrome/GUI hoặc chứng nhận native focus/keyboard/IME**. Smoke lỗi worker `UNAUTHORIZED` và `SCHEMA_UNSUPPORTED` hiển thị đúng nguyên nhân, không còn câu reload chung.

Review source độc lập không phát hiện lỗi trong cutover. Các tình huống độ trễ URL/report thật, prerender/BFCache và báo cáo trễ từ document cũ chưa được kiểm chứng trong Chrome; không thêm retry hoặc mở rộng quyền để đoán xử lý. Những bảo vệ và giới hạn này không được suy diễn thành nghiệm thu browser.

Sau khi nhận bản sửa, người dùng xác nhận “Oke nó đã hoạt động ổn rồi” vào 2026-11-08. Ghi nhận đây là **người dùng tự kiểm tra Chrome và xác nhận lỗi kết nối đã hết trong luồng họ vừa thử**; chưa có báo cáo chi tiết cho từng tổ hợp navigation/focus/IME/fullscreen, không tự đánh dấu toàn bộ checklist dưới đây pass.

Checklist kiểm tra chi tiết (chưa có báo cáo riêng cho từng bước):
1. Reload đúng extension hiện có đang trỏ vào `dist/`, rồi tải lại YouTube; không Remove hoặc đổi folder/ID.
2. Từ trang chủ YouTube, bấm một video thường và đợi video chính sẵn sàng; bấm N, rồi Option+N. Panel phải kết nối, đọc đúng sổ/note, cho nhập nháp.
3. Chuyển từ A sang B bằng liên kết YouTube, không reload toàn trang. Ghi chú/nháp phải thuộc đúng video; quay lại A phải còn dữ liệu đã lưu.
4. Nếu lỗi tái xuất hiện, gửi thông báo cụ thể/ảnh; không gửi token hoặc note riêng tư. Native focus, IME, fullscreen và persistence của bản sửa chưa có báo cáo nghiệm thu riêng cho từng kịch bản.

## Chốt phiên và nghiệm thu người dùng — 2026-11-07

Sau bản phím đóng, người dùng báo “Oke ổn hết rồi” và yêu cầu commit/push GitHub. Trước đó họ đã xác nhận fullscreen chia vùng hoạt động. Ghi nhận đây là **nghiệm thu do người dùng tự thao tác** cho các flow vừa phát triển, không phải browser automation của trợ lý và không tự đánh dấu toàn bộ checklist cũ pass.

Không có phiên bản Chrome cụ thể hoặc báo cáo từng tổ hợp IME/multiwindow/quota; những mục đó vẫn chưa được chứng nhận riêng. Không suy diễn open-source source push thành release/tag hay Chrome Web Store publication. Lần chốt này chỉ commit source, lockfile và tài liệu; không đưa node_modules/dist/artifacts/công cụ local hoặc dữ liệu ghi chú vào Git.

Trước commit/push đã chạy lại từ lockfile bằng `npm ci`: cài 87 packages, typecheck exit 0, 215/215 tests trong 16 files, build/pack/unzip thành công. Đây là cài lại dependencies trong working tree hiện tại, không phải clean Git checkout hay bằng chứng CI Linux đã pass.



## Mới nhất: phím đóng Option+Command+N

Người dùng xác nhận bản fullscreen chia vùng đã hoạt động. Đây là báo cáo nghiệm thu flow cơ bản/bố cục của họ, không tự mở rộng thành chứng nhận mọi IME/OS/YouTube variant.

Theo yêu cầu mới: Option+Command+physical N trên Mac chỉ đóng panel, từ trang hoặc textarea; panel đã ẩn vẫn ẩn. Cùng semantics nút Đóng ghi chú: giữ iframe và chữ/nháp, khôi phục bố cục, không ép commit/hủy note hoặc đổi playback. IME, keyCode229, repeat, Ctrl/Shift hoặc thiếu Option/Command không được bắt.

Regressions đã quan sát RED trước sửa: thiếu shouldClosePanelShortcut và key trong textarea không bị xử lý/host không đóng. Sau sửa: **215/215 tests, 16 files**, typecheck/build/pack/unzip pass. Source DOM test nối frame keydown → private lifecycle → host.hide, giữ cùng iframe/text, không nhận source/origin giả, IME/repeat/Shift không bị chiếm.

Built content IIFE smoke (Node/jsdom) đã chạy nhánh close từ trang với trusted-key adapter và nhánh frame-origin/source close; panel ẩn không mở lại, fullscreen style được phục hồi, cùng frame/text khi mở lại, không gửi save/discard/pause/resume. Đây không phải keyboard/OS acceptance. ZIP16 runtime files: `artifacts/chudin-note-youtube-0.1.0.zip`, SHA256 `917eea3169a39b8ad2e89af50c0a50d35937ccae57b8feb5415add172e33805e`. Throwaway smoke được xóa sau kiểm chứng; không có browser/desktop/Git operation.

Người dùng kiểm tra: Reload đúng extension + tải lại YouTube → fullscreen Option+N → nhập nháp chưa lưu → Option+Command+N: panel ẩn/video dùng lại vùng cũ, playback không tự đổi. Option+N mở lại phải còn nháp/chữ/mốc. Sau lưu Enter, thử đóng khi video đang chạy. Thử close khi con trỏ ở trang và ô nhập; tránh composition đang dở; khi panel đóng, shortcut không được mở nó lại. OS/Chrome/extension khác có thể giữ tổ hợp trước khi trang nhận key — native chord chưa được command smoke chứng nhận.


## Fullscreen chia vùng xem và ghi (người dùng xác nhận flow cơ bản)

Người dùng đã đính chính “không hiện”: panel có hiện, báo flow cơ bản hoạt động. Screenshot tiếp theo xác nhận fullscreen bị panel che phần phải của hình/phụ đề. Không còn coi báo thiếu panel đó là lỗi đang tái hiện; không suy diễn toàn bộ batch IME/multiwindow/restart đã được nghiệm thu.

Đã duyệt: video bên trái, panel riêng bên phải; giữ fullscreen, không méo/cắt hình; title/caption/transport nằm trong vùng trái. Đóng panel khôi phục toàn vùng xem; Enter lưu vẫn giữ panel mở. Không thay iframe/video hoặc schema. 420px ưu tiên, fullscreen tối đa nửa viewport.

Command cuối đã quan sát sau review: typecheck exit0, **213/213 tests, 16 files**, build/pack/unzip pass. Real built content IIFE smoke trong Node/jsdom: viewport1600x900 → media box1180x900 contain (ảnh16:9 suy ra1180x663.75); captions/title1180px, controlsleft12+width1156 kết thúc1168 trước panel; viewport640x480 →320/320. Settings menu neo ngoài panel ở cả normal/big mode; fullscreen DOM/class transitions, resize, quick pause720, close/exit/dispose khôi phục style; cùng iframe/nháp.

Các số geometry trên là CSS/computed DOM và phép tính contain, **không phải ảnh render Chrome**. jsdom không có native top layer hoặc shadow iframe browsing context; smoke chỉ adapter các boundary đó. Fullscreen root UA!important và inline layout YouTube thật vẫn cần người dùng kiểm tra.

Hai reviewer source độc lập: geometry/CSS và host/lifecycle. Important cùng phát hiện: settings menu vẫn neo vào mép phải của fullscreen root nên có thể mở dưới panel. Đã quan sát RED12/24px thay vì432/444px, rồi GREEN sau sửa neo menu theo panelWidth, max-width và mode. Các Important đã xử lý; không reviewer nào chạy Chrome hoặc chứng nhận pixel.

Artifact mới: `artifacts/chudin-note-youtube-0.1.0.zip`,16 runtime files; SHA256 `5e15acd77644bb42dc61c8c14fa7253f9ad2c2ed84b7b3ad42449af24626ecdd`.

Minor/giới hạn còn lại: observer toàn subtree vẫn nhận callback khi host ẩn (sớm return; chưa đo overhead); chuyển trực tiếp giữa hai fullscreen element khác nhau có thể đổi thứ tự top layer, ngoài flow YouTube chuẩn chưa thử; ad/card/end-screen overlays khác chưa có đủ DOM/Chrome bằng chứng, có thể cần đóng panel để thao tác. Top title inset đổi nhẹ, bottom inset12px chưa chứng nhận so với big-mode native; phải thử seek/scrub thực tế. Ancestor-fullscreen với player còn inline-sized và một bên khác thay marker không phải flow đã chứng nhận. CSS!important so với video inline px, YouTube JS cached widths, CSP và native top layer chỉ có source review/CSSOM, không có browser proof.

Người dùng thử bản mới:
1. Reload đúng extension đang cài, tải lại tab YouTube; không Remove.
2. Mở video chính, chọn sổ, bật fullscreen → Option+N. Phải thấy toàn bộ khung hình/phụ đề bên trái, editor bên phải; con trỏ gõ ngay, mốc lùi 20 giây.
3. Enter lưu → video chạy tiếp, panel vẫn mở, hình không bị panel phủ. Bấm Đóng ghi chú → video dùng lại toàn bộ fullscreen.
4. Mở panel trước rồi vào/thoát fullscreen; resize; đóng/mở khi có nháp. Thử progressbar/seek và mở menu bánh răng đổi chất lượng, tốc độ, phụ đề: controls/menu không nằm dưới panel, chữ/nháp không mất.
5. Gửi ảnh nếu có crop/che/phụ đề/controls lệch. Cảnh báo phiên hết hạn trong screenshot đã được thấy, nhưng chưa đủ bằng chứng phân biệt lỗi auth mới với status cũ; không suy diễn hoặc tự thay dữ liệu.


## Lịch sử: chuyển host vào trang

Người dùng đã thử Chrome và xác nhận Option+N tạo được mốc/nháp nhưng không chuyển bàn phím vào native side panel; phải click textarea. Đây là **FAIL nghiệm thu focus**, không phải CHƯA CHẠY. Không dùng bằng chứng jsdom cũ để phủ nhận kết quả này.

Người dùng đã duyệt thay native host bằng panel iframe extension-origin bên phải YouTube, giữ giao diện/editor, không ô nhập phụ/popup. Đồng thời yêu cầu note mới từ Option+N lùi 20 giây, chặn 00:00; nháp cũ giữ nguyên. Các phần bên dưới về native panel là bằng chứng lịch sử trước cutover.

Đã quan sát RED→GREEN riêng offset: 720→700, 12→0; gõ/Enter lưu đúng mốc; lần Option+N tiếp giữ nguyên nháp/text/time. 12/12 editor tests pass sau sửa; kết quả bản cutover hoàn chỉnh ở dưới.

Checklist cho bản mới (người dùng tự thao tác, chưa nghiệm thu):
- Reload đúng extension hiện có, không Remove; tải lại YouTube.
- Đợi video chính, chọn sổ; Option+N ở 12:00 → pause 12:00, con trỏ nhấp nháy trong ô cũ, note 11:40; gõ ngay không click.
- Shift+Enter newline, IME tiếng Việt không submit; Enter commit xong mới play.
- Thử lại khi panel đang mở; đóng bằng Đóng ghi chú rồi mở lại; nháp/chữ/time không mất, không trùng.
- Thử dưới 20 giây → note 00:00; ghi thủ công vẫn lấy thời điểm hiện tại.
- Hai tab/SPA A→B→A, worker restart, nháp cũ, toolbar và Cuốn sổ vẫn đúng identity/dữ liệu.
- Layout video/panel ở kích thước thật và fullscreen do người dùng đánh giá; không được tuyên bố pass từ command smoke.

## Bằng chứng cutover đã quan sát

- `npm run typecheck`: exit 0; `npm test`: **204/204 tests, 15 files**, sau sửa review.
- `npm run build`, `npm run pack`, `unzip -t`: pass, ZIP gồm 16 runtime files.
- Archive: `artifacts/chudin-note-youtube-0.1.0.zip`; SHA256 `067f10d0f5edaf682b83240ab817466f1d4da7dd7f847343c241408ce11678a4`.
- Node/jsdom chạy **built service-worker.js, content.js IIFE và sidepanel.js ESM thật**, Chrome transport/IDB/browsing context là adapter: iframe focus trước reply → xác thực frame → textarea focus → pause 720, note 700 → hide/reopen giữ cùng textarea/chữ/time → Enter commit trước play → Option+N lần tiếp từ focus sau save tạo nháp đúng. Frame không có session bị từ chối; note không xuất hiện trong DOM trang cha.
- jsdom không tạo browsing context cho iframe trong shadow root: tests/smoke chỉ cung cấp riêng boundary đó. Không giả lập native focus và không xem đây là chứng nhận Chrome. Scripts smoke tạm được xóa; regressions hành vi được giữ.
- Mechanical UI detector chạy một lần, trả `[]`; không chứng nhận layout/contrast hay native IME.

Hai reviewer độc lập đã đọc worker/security và interaction/lifecycle. Sửa sau review, có RED→GREEN: focus sau save trước đó trỏ vào nút còn disabled; grant thay thế không refresh controller; kéo tab sang window mới còn dùng windowId cũ; loading notification không chứng minh top document đổi nhưng lại revoke phiên giữa thao tác. Full suite/build/bundle smoke nêu trên chạy sau các sửa.

Quyết định: auth failures dùng UNAUTHORIZED để yêu cầu phiên mới, không retry mutation; STALE_CONTEXT dành cho player/navigation. Reattach refresh controller với windowId hiện tại, giữ cùng editor. Document mới được xác định bằng trusted top-frame documentId/report/open, không suy diễn từ tab loading. Không đổi IndexedDB/schema/name.

### Lưu ý nhỏ sau review cutover

- Kết quả Chrome thật cho focus, IME, autoplay, CSP/iframe và layout/fullscreen còn chờ người dùng; đây là giới hạn chứng nhận, không đánh dấu pass.
- Trước khi cold editor sẵn sàng/con trỏ xuất hiện, ký tự gõ vào body chưa được buffer; UI có trạng thái kết nối. Kiểm tra cả chữ đầu tiên khi thử Chrome.
- N đơn/icon chỉ mở panel; focus textarea sau hide/reopen không có quick intent có thể cần click. Option+N phải focus trực tiếp và là flow nghiệm thu.
- Host rộng cố định 420px, cap theo viewport lúc mở; chưa cập nhật phần margin dự trữ giữa các lần resize khi vẫn mở. Các phần fixed của YouTube có thể bị che [INFERENCE]; cần người dùng đánh giá.
- Một reply UNAUTHORIZED muộn của request dùng token cũ có thể yêu cầu reauth thêm dù token mới đã nhận; dữ liệu local không remount/drop, mutation không tự replay.
- Trang cha có thể gửi grant giả làm gián đoạn lần xác thực đầu, nhưng worker từ chối token và không cấp quyền/đọc note; grant hợp lệ sau vẫn được nhận. Availability của host không được bảo vệ khỏi trang cha xóa/che iframe.
- `sender.tab.url` vắng vẫn được xét cùng token/tab/document đã xác thực; chưa có bypass quyền cụ thể, nhưng URL hiện diện thì bắt buộc origin YouTube.

## Bằng chứng trước cutover (lịch sử)

Môi trường build: Node 24.14.1, npm 11.11.0, macOS arm64. Chỉ command-line, không điều khiển desktop/browser.

- TypeScript strict: `npm run typecheck` exit 0.
- 84 behavioral tests qua Vitest: domain, transactional IndexedDB, player identity/navigation, window-local routing, sender security, editor revisions, async conflict recovery, N/Option+N và pause/focus/save/resume ordering.
- `npm run build`: Vite tạo dist/ với worker ESM, content script IIFE, panel/reader và icon local.
- `npm run pack` và `unzip -t`: archive integrity thành công; allowlist 16 runtime files.
- `npm ci --ignore-scripts` cài lại thành công từ lockfile; typecheck và 43 tests pass sau cài. Đây không phải clean Git checkout.
- Throwaway Node/jsdom integration smoke, chạy module UI/worker/repository và **content.js IIFE thật**: ghi/lưu timestamp 80.9, pause/seek ACK, window-local context, SPA A→B→A giữ nháp, hai sổ/ba video không trộn dữ liệu, NFC/NFD search, literal HTML an toàn, sửa note offline, đóng/mở database giữ note/nháp. Chrome API được adapter command-line mô phỏng; đây không phải Chrome integration chứng nhận.

CI workflow đã viết nhưng chưa push/chạy trên GitHub. Clean checkout/cài và update Chrome chưa thử. Đợt đầu sau source review có 57 tests; sau phản hồi quảng cáo/phím N đã chạy 71 tests, typecheck, build/pack/unzip và các command smoke nêu bên dưới.

## Người dùng tự kiểm tra Chrome

**Chưa có batch nghiệm thu Chrome đầy đủ.** Ảnh người dùng gửi đã xác nhận panel hiển thị, có một sổ được chọn và trạng thái quảng cáo khóa ghi mới; người dùng báo không bấm/nhập được trong ảnh. Chưa có bằng chứng Chrome sau quảng cáo hoặc cho phím N mới. Trợ lý không được mở/điều khiển Chrome kể cả browser relay/managed browser.

Dùng Chrome profile thử nghiệm. Mở `chrome://extensions`, Developer mode → Load unpacked → chọn `dist/`. Tải lại các tab YouTube đã mở. Ghim icon extension nếu cần. Không gỡ bản đang chứa note quan trọng chỉ để kiểm tra.

| Batch | Thao tác | Mong đợi | Trạng thái |
| --- | --- | --- | --- |
| 1 | Bấm icon ở watch page và trang khác | Native panel mở; trang không hỗ trợ có thông báo, vẫn mở được Cuốn sổ | MỘT PHẦN: ảnh người dùng xác nhận panel đang mở ở watch page; phần còn lại chưa thử |
| 1 | Tạo hai sổ, gán A/B vào sổ 1, C vào sổ 2 | Đúng sổ, không tự gom playlist, video lẻ dùng được | CHƯA CHẠY |
| 1 | Bắt đầu nháp lúc 01:20, viết tới lúc khác rồi lưu | Note giữ 01:20, không tự pause/resume lúc viết | CHƯA CHẠY |
| 1 | Nhập tiếng Việt, Enter/N/Space, Cmd/Ctrl+Enter, composition | Nhập bình thường, không save giữa composition | CHƯA CHẠY |
| 1 | N ở trang video, N trong search/bình luận/editor, Shift+N và IME | N ngoài ô gõ mở panel; không chiếm chữ N hoặc shortcut có modifier | CHƯA CHẠY trên Chrome sau cập nhật |
| 1 | Option+N lúc panel đóng/đang mở, gõ rồi Enter; Shift+Enter/IME; nháp cũ | Pause/focus không dùng chuột, timestamp đúng lúc pause; Enter commit xong mới play; không xóa/trùng nháp hoặc resume sau lỗi | CHƯA CHẠY trên Chrome sau cập nhật |
| 1 | Cuốn sổ: đọc toàn sổ/từng video, tìm có dấu/không dấu/không kết quả, video title trùng | Không lẫn video/sổ, giữ filter khi xóa query | CHƯA CHẠY |
| 1 | Bấm timestamp panel và cuốn sổ, có/không có tab video | Đúng window/video, pause/seek; không đè tab khác | CHƯA CHẠY |
| 2 | Chờ “Nháp đã được giữ”, đóng/mở panel rồi restart Chrome | Khôi phục đúng bản đã commit; không hứa chữ chưa commit | CHƯA CHẠY |
| 2 | Đang viết A, SPA A→B→A; hai tab/hai cửa sổ | Không trộn nháp/timestamp, không để reply cũ đổi video mới | CHƯA CHẠY |
| 2 | Hai writer cùng video, sửa/xóa ở hai nơi, chọn bản khôi phục | Revision conflict không overwrite; draft khác còn đọc được | CHƯA CHẠY |
| 2 | Lưu/hủy nháp rồi chuyển sổ; cửa sổ khác còn draft cũ | Toàn video/note đi cùng; draft stale phải xác nhận rebind | CHƯA CHẠY |
| 2 | Worker ngủ/restart, tua đang chờ; đổi/đóng tab trước ACK | Không tua nhầm, không báo thành công giả, timeout hữu hạn | CHƯA CHẠY |
| 3 | Ad/live/Shorts/embed/unsupported/loading/private/offline | Không gắn timestamp sai; note local vẫn đọc/sửa được | CHƯA CHẠY |
| 3 | 320px, thấp chiều cao, sáng/tối, note/title/link dài, HTML literal, bàn phím/focus | Không clipping hành động, chữ wrap, không chạy HTML, focus đọc được | CHƯA CHẠY |
| 3 | Lỗi persistence/quota/transaction/schema trong test profile | Giữ input, báo lỗi, không giả “đã lưu”, không reset database | CHƯA CHẠY |
| 3 | Build từ clean checkout, cài ZIP; update cùng folder/ID không gỡ | Runtime archive đúng, note/nháp cũ còn; chưa hứa profile/ID khác giữ dữ liệu | CHƯA CHẠY |

## Cách gửi kết quả

Batch đầu chỉ cần gửi: Chrome/OS version; mở panel được không; tạo sổ/ghi/lưu/timestamp/đọc lại được không; thao tác nào fail và nguyên error đã ẩn thông tin cá nhân. Screenshot nếu có giúp review thị giác, nhưng người dùng tự chụp, trợ lý không điều khiển browser.

Kiểm tra failure cần DevTools/test profile riêng và hướng dẫn cụ thể từ source hiện tại. Không tự chạy đoạn xóa database, uninstall hoặc quota probe trên profile thật. Automated rollback/schema tests không thay bằng phá dữ liệu thực để tạo lỗi.

## Source review và bản sửa đã kiểm chứng

Hai reviewer độc lập đã đọc code: data/security/player/routing và UI/packaging. Không reviewer nào chạy browser hoặc xác nhận Chrome. Bản sau sửa được kiểm chứng bằng regressions và command smoke, không phải một vòng re-review độc lập khác.

- Đã bắt RED rồi GREEN cho: bắt đầu nháp liên tiếp; capture stale trước khi tạo nháp; durable draft vừa tạo khi chuyển video; first-focus capture; explicit rebind khi video chuyển sổ; mở reader không điều hướng đè; panel không thao tác tab đã mất active; tab đóng trả lỗi player; tab mới có url rỗng/pendingUrl; retry edit đã commit; frozen message channel timeout; ACK cùng identity nhưng sai timestamp.
- Thêm kiểm tra input vượt giới hạn vẫn giữ chữ/báo lỗi trong Node DOM và bản nháp local đã bị nơi khác retire: đóng bản local không xóa bản writer khác. Paste/IME của Chrome thật vẫn CHƯA CHẠY.
- Sửa cùng boundary: không broadcast reload toàn bộ UI trên từng draft update; giữ cảnh báo ghi lỗi tới khi ACK thành công; báo lưu ở reader; không tự gán video mới khi context đã đổi trong dialog tạo sổ; giữ source draft đã commit ở đúng video slot; explicit đọc lại/rebind để xử lý lost reply thay vì retry nền.
- Command cuối: 57/57 pass, typecheck exit 0, Vite build/pack/unzip pass; smoke source mới với content.js IIFE thật pass. Mechanical UI detector chạy một lần và trả `[]`; không chứng nhận layout/contrast/native focus.

## Quyết định triển khai và đánh đổi

1. Làm ngay trong repository ban đầu, không tạo worktree/branch/commit vì chưa được phép Git mutations. Đánh đổi: thay đổi chưa có isolation bằng nhánh Git; không xóa code/tài liệu người dùng.
2. Ledger viết trực tiếp thay cho skill scripts phụ thuộc Git; source review đọc files thay vì commit range. Đánh đổi: chưa có lịch sử commit/range review; người dùng quyết định commit sau.
3. Dùng Promise constructor cho browser event APIs vì Promise.withResolvers mới hơn Chrome 116. Đánh đổi: callback dài hơn, không polyfill hoặc tăng browser floor ngầm.
4. Pin dependency theo bản cài thật; engine hỗ trợ ^22.13.0, ^24.0.0 hoặc >=26.0.0. Đánh đổi: Node 22 patch cũ và các dòng odd 23/25 không hỗ trợ bởi dependencies hiện tại.
5. Worker restart hủy pending seek chưa có document binding. Đánh đổi: có thể cần bấm timestamp lại, ưu tiên không tua nhầm tab/document.
6. Giữ giao diện tiết chế note-iina theo thiết kế đã duyệt, không mở lại vòng chọn concept. Đánh đổi: không có visual prototype/so sánh ý tưởng; native/pixel verification chờ người dùng.
7. Ad/live không tự đợi hoặc tua qua: báo không hỗ trợ, người dùng chờ video thường rồi bấm lại. Đây là giới hạn đã duyệt, không tự thêm automation cho quảng cáo.
8. Các mục reviewer không thể phán xét về Chrome/IME/DOM YouTube/bfcache/worker/native install được giữ là CHƯA CHẠY trong checklist, không hạ tiêu chí nghiệm thu. Đánh đổi: build này để thử bằng dữ liệu mẫu, chưa release-ready.
9. UI/security/release được hai reviewer chia phạm vi và bổ sung chéo; performance tại quota/large-notebook thật và threats ngoài manifest/message model chưa được chứng nhận. Không lấy source review hoặc jsdom làm bằng chứng bảo đảm mọi môi trường.

## Lưu ý nhỏ chưa xử lý sau review

Không phải chứng nhận lỗi Chrome đã tái hiện; mục có thể phụ thuộc browser được ghi rõ.

- Controller-level action errors có thể hiện sau đổi context dù editor đã chặn stale state; cần quan sát timing/status thật.
- Focus sau đóng editor trong reader và thứ tự heading h2/h1 ở panel cần accessibility check thật; focus thao tác ghi mới đã được xử lý trong editor.
- Recovery preview dùng slice theo UTF-16, có thể cắt đôi một emoji; dữ liệu đầy đủ không bị cắt.
- CI có cả push/pull_request nên PR nội bộ có thể chạy hai lần.
- Tham số URL tracking/playlist cùng video vẫn có thể tăng generation, khiến request đang chờ phải bấm lại.
- Pending seek đã bound có thể được phát lại sau worker restart nếu ACK đã xong nhưng chưa xóa pending; trong giới hạn deadline, chưa chứng nhận native lifecycle.
- Clamp tới duration có thể kích hoạt ended/autoplay của YouTube [INFERENCE]; cần thử video ngắn hơn timestamp.
- Double-click thật nhanh trước khi tabs.create trả về vẫn có thể mở hai tab; pendingUrl của tab đã tạo được xét để giảm trùng.
- bfcache restore sau pagehide có thể không tự phát report nữa; on-demand capture còn hoạt động; cần Chrome thật.
- Title cập nhật trong getPanelContext không broadcast riêng; reader nhận title mới khi focus/reload snapshot.
- Timing sender.url/report lúc navigation chưa chứng nhận; capture chủ động re-report để khôi phục registry.
- Protocol cho ID tối đa 1000 ký tự nhưng repository tối đa 256; UUID production không chạm khác biệt này.
- Một số boundary như blocked/versionchange, quota thật, restore cạnh tranh và navigation giữa seek chưa có mọi tổ hợp regression; không suy diễn coverage đầy đủ.

## Phản hồi quảng cáo và bổ sung N

Ảnh người dùng: video đang phát quảng cáo YouTube, panel hiện advertiser title, sổ đã chọn, nút Ghi chú mới/ô nhập bị khóa. Khóa timestamp trong quảng cáo là có chủ ý; không suy diễn người dùng đã gặp cùng lỗi sau khi video chính chạy.

Source diagnosis:
- `inspectPage` đọc metadata tên player trước khi kiểm tra ad, dẫn tới advertiser title.
- Panel chỉ ghi status khi text mới không rỗng, nên status ad cũ có thể còn sau ready.
- Chưa có handler phím N trong bản trước.

Đã sửa: ưu tiên watch heading theo video ID đang xem; không lấy title quảng cáo nếu chưa có heading; xóa đúng status ad cũ khi về ready, refresh hướng dẫn và enable controls theo readiness/sổ; thêm trusted unmodified N ngoài ô gõ/IME. Không thêm quyền hoặc đổi schema, không tự mở note/pause khi nhấn N.

Bằng chứng command của bản mới:
- Hai title regressions thất bại trước sửa, pass sau sửa; observer báo ad→ready với thời gian video chính.
- Node/jsdom smoke qua observer, panel controller, editor và IndexedDB thất bại trước sửa do status ad không xóa; pass sau sửa: ad khóa ghi, main video tự bật editor, đúng lesson title, note lưu giây 83 thay vì giây 4 quảng cáo.
- 11 shortcut tests: key guards, text/IME/shadow editor, Shift+N/modifiers/repeat, sender/top-frame/origin/active-window authorization, API reject và synchronous error.
- Smoke **built service-worker.js entry thật** với Chrome API adapter: yêu cầu open gọi đồng bộ trong window 7 của sender, bỏ window 999 từ payload, không mở IndexedDB. Đây không chứng nhận Chrome chấp nhận user gesture thật.
- 71/71 tests, typecheck, build/pack/unzip pass. Source/worker smoke không dùng browser và các scripts tạm được xóa sau khi chạy.

Người dùng thử bản mới: Reload đúng extension đang cài (không Remove), tải lại YouTube tab, đợi video chính, kiểm tra tiêu đề/nút/ô nhập; đóng panel, click vùng video rồi bấm N. Thử N trong search/bình luận và Shift+N để kiểm tra không bị chiếm. Nếu cài ZIP ở folder khác, giải nén build mới đè **cùng folder cũ** trước Reload. Báo ảnh sau quảng cáo + Chrome version nếu vẫn bị khóa, hoặc bấm icon được nhưng N không mở.

## Ghi nhanh Option+N và Enter phát tiếp

Theo yêu cầu người dùng, thêm chế độ ghi nhanh ngoài N đơn. Physical Alt+KeyN nhận được macOS dead-key `Option+N`; không chặn text/search/comments/contenteditable hoặc composition. Content script pause/capture đồng bộ trước mở panel. Worker giữ intent tạm 60s theo window với binding từ sender, không tăng permissions/schema. Panel cold mount hoặc đang mở đều đọc intent, load đúng context rồi tạo/tiếp tục nháp và focus textarea. Đã có một nháp bền vững thì phục hồi; nhiều bản yêu cầu chọn rõ.

Trong quick mode Enter lưu rồi mới resume bằng authenticated command cùng window/tab/document/video/generation; Shift+Enter xuống dòng, IME Enter không submit. Manual/reader Enter vẫn multiline. Nếu ghi fail, giữ chữ và không play; nếu ghi đã commit nhưng play bị Chrome từ chối, báo lỗi playback riêng thay vì lưu lại.

Command smoke trên module/bundle thật (Node/jsdom, không browser) đã chứng minh: pause media ở 83.25s → built worker mở panel → cold mount focus → gõ → Shift+Enter không submit → Enter commit IndexedDB trước khi content IIFE play. Kiểm tra thêm panel đang mở re-focus, đóng/mở lại phục hồi nháp duy nhất ở 120s dù lần pause mới là 150s, không tạo trùng. Fake Chrome adapter không chứng nhận OS focus, user gesture hoặc autoplay trong Chrome thật.

Ruling: dùng request tạm có deadline thay vì persist thao tác focus qua restart — worker restart có thể cần bấm Option+N lại; note/nháp đã commit vẫn bền vững. Không thêm command toàn browser hoặc bắt Option+N trong ô gõ vì sẽ phá macOS nhập dấu. Không auto resume sau hủy hoặc save lỗi.

Hai reviewer độc lập đọc source phần playback/security và editor/panel. Sau review: đã quan sát RED→GREEN cho intent mới đến khi ack cũ đang chờ (không rơi yêu cầu), hủy confirm phục hồi nháp (không tạo trùng/ack nhầm), và quay về cùng video ở generation mới (Enter không còn chế độ resume cũ). Bổ sung lease theo request ID: pause mới thu hồi quyền resume của save cũ, kể cả request mới đã ack; worker restart không resume mù.

Quyết định và giới hạn review:
- Người dùng yêu cầu Enter phát tiếp, nên Option+N trên video vốn đã pause vẫn cho Enter phát; không âm thầm đổi thành khôi phục trạng thái cũ.
- Native OS focus, sticky user activation/autoplay và fullscreen chưa được chứng nhận. Nếu Chrome không cho focus hoặc play thì cần người dùng báo kết quả; không điều khiển browser thay họ.
- Minor chưa xử lý: synchronous sendMessage throw sau extension reload chỉ có console/error thay vì UI fallback; nên tải lại YouTube sau Reload extension. Giữ Enter quá lâu sau save có thể kích hoạt nút được focus; chỉ bấm Enter một lần. Tự phục hồi một nháp thuộc writer khác có thể làm writer cũ gặp conflict (data không bị ghi đè); nhiều cửa sổ cần chọn/kiểm tra bản muốn tiếp tục.
- Physical Option+N dùng vị trí phím N; layout không QWERTY có thể khác chữ hiển thị. Không thêm global shortcut ngoài trang YouTube.

Kịch bản người dùng: Reload đúng extension + tải lại YouTube → chọn sổ cho video → click vùng player → Option+N → xác nhận video pause và gõ ngay không click ô → Shift+Enter xuống dòng → Enter lưu và video chạy lại. Thử lần hai lúc panel đã mở và thử nháp cũ. N đơn vẫn chỉ mở. Lưu thất bại không được phát tiếp; đổi video trước khi save không được play video mới.
