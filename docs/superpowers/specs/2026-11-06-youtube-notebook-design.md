# Thiết kế: ghi chú YouTube theo cuốn sổ

Ngày: 2026-11-06.
Trạng thái: **Người dùng đã duyệt thiết kế và kế hoạch; đã triển khai build local, đang final review và chờ người dùng nghiệm thu Chrome thật. Xem docs/TESTING.md.**

## 1. Mục đích và nguồn quyết định

Giúp người xem tự viết lại điều mình hiểu tại những đoạn quan trọng của video YouTube, rồi đọc lại ghi chú theo video hoặc theo một cuốn sổ nhiều video. Lấy luồng học và ôn bài của `note-iina` làm tham chiếu, không chuyển nguyên kiến trúc IINA sang Chrome.

Người dùng đã xác nhận:

- Đây là extension Google Chrome, có side panel khi xem YouTube.
- Có cuốn sổ tập hợp ghi chú từ nhiều video, giống cuốn sổ course trong `note-iina`.
- Tự tạo cuốn sổ và chọn sổ cho video; không tự lấy playlist làm course.
- Repository sẽ công khai trên GitHub, có release để người khác cài và đóng góp.

Người dùng đã duyệt các lựa chọn phạm vi, kỹ thuật, tên hiển thị và MIT trong tài liệu này. Các nhãn “đề xuất” bên dưới ghi lại nguồn của quyết định, không còn là yêu cầu đang bỏ ngỏ. Người dùng bổ sung: chỉ phát hành GitHub, không Chrome Web Store; trợ lý không điều khiển máy tính hoặc browser.

Tham chiếu đã đọc: `note-iina/PRODUCT.md`, `DESIGN.md`, `README.md`, và `note-iina.iinaplugin/lib/session.js` về thời điểm bắt đầu nháp, định danh nháp và xác nhận lưu đúng phiên bản. Không sao chép code trong bước này.

### Ràng buộc thực thi do người dùng bổ sung

- Trợ lý đọc/sửa source và tài liệu; được đọc tài liệu kỹ thuật tĩnh, không được mở hoặc điều khiển app/browser, kể cả browser relay, browser tạm hoặc qua agent khác.
- Cập nhật sau đó: người dùng cho phép trợ lý tự chạy build tooling theo implementation plan, gồm cài dependency, typecheck/test/build/pack và command-line smoke không browser. Không được điều khiển máy tính/browser qua GUI hoặc thay đổi Git/publish.
- Chỉ kiểm tra/cài extension trong Chrome và thao tác desktop còn giao người dùng; gửi checklist cụ thể và chờ kết quả.
- Giữ nguyên tiêu chí nghiệm thu; báo riêng bằng chứng command, quan sát browser do người dùng báo và phần chưa thử. Không tự đánh dấu Chrome PASS từ việc đọc source hoặc test.
- Không tự commit/push/publish; Chrome Web Store không thuộc phạm vi, không chuẩn bị quy trình submit Store.

## 2. Các hướng đã cân nhắc

### Cách tổ chức cuốn sổ

- **Tự tạo sổ, chọn sổ cho video — người dùng đã chọn.** Gom được video lẻ và video từ nhiều playlist; cần một thao tác chọn sổ.
- Theo playlist: ít thao tác cho một khóa học có sẵn playlist, nhưng không diễn tả tốt video lẻ hoặc chủ đề lấy từ nhiều playlist. Không chọn.

### Bề mặt sử dụng — đề xuất kỹ thuật

- **Native side panel + trang cuốn sổ trong tab extension — chọn đề xuất này.** Ghi cạnh video; ôn tập trên trang đủ rộng. Chrome quản lý panel và cửa sổ; không cần giả lập player.
- Toàn bộ ghi và đọc trong side panel: ít bề mặt hơn nhưng đọc/tìm xuyên nhiều video bị giới hạn chiều rộng.
- Drawer chèn vào trang YouTube: kiểm soát bố cục hơn nhưng phụ thuộc DOM/CSS của YouTube và không đáp ứng tốt ý định dùng side panel Chrome.

### Lưu trữ — đề xuất kỹ thuật

- **IndexedDB trong origin extension — chọn đề xuất này.** Local, có transaction cho note và nháp, không cần tài khoản hoặc backend.
- `chrome.storage.local`: API đơn giản nhưng không có transaction nhiều bản ghi; cần cơ chế riêng để tránh mất cập nhật giữa các bề mặt.
- File trong folder như IINA: Chrome không có quyền filesystem tương đương; việc chọn/quản lý file tạo một luồng khác. Không chọn.

## 3. Phạm vi đề xuất

### Các chức năng sẽ triển khai sau khi được duyệt

- Tạo, chọn và đổi tên cuốn sổ.
- Gán một video vào một sổ; có thể chuyển video sang sổ khác cùng toàn bộ note của nó.
- Ghi chú văn bản thuần nhiều dòng, timestamp tự lấy lúc bắt đầu nháp.
- Lưu tường minh bằng nút hoặc Cmd/Ctrl+Enter; nháp được lưu riêng tự động.
- Đọc, sửa nội dung và xóa note có xác nhận.
- Bấm timestamp để mở đúng video, pause và seek tới đoạn ghi chú.
- Trang cuốn sổ: chọn sổ, xem danh sách video, đọc theo video hoặc toàn sổ, tìm trong nội dung ghi chú của sổ đang chọn.
- Lưu dữ liệu trên máy; không tài khoản, telemetry, cloud sync hay backend.
- Giao diện tiếng Việt, sáng/tối theo hệ điều hành, hỗ trợ bàn phím và IME.

### Không thuộc phạm vi này

AI, transcript, tóm tắt, chụp màn hình, rich text/Markdown rendering, tags, cộng tác, đồng bộ thiết bị, tự nhập playlist, xuất/nhập dữ liệu, xóa cả sổ, và hỗ trợ Firefox/Safari. Không xây player hoặc ứng dụng độc lập.

Không có export/import đồng nghĩa dữ liệu hiện không có bản sao lưu do extension tạo. Đây là giới hạn cần công khai, không được gọi local storage là backup. Không có lời hứa tương thích hoặc chia sẻ file với `note-iina`.

### Giới hạn YouTube

Hỗ trợ video thường trên `https://www.youtube.com/watch?v=…`, bao gồm video thường mở trong ngữ cảnh playlist. Tham số playlist không đổi danh tính video hoặc sổ đã chọn.

Không chứng nhận Shorts, embed, trang mobile, video live/premiere đang phát trực tiếp, nội dung chỉ có DVR, hoặc thao tác ghi/seek trong quảng cáo. Khi nhận diện những trường hợp này, hiện lý do và khóa bắt đầu note/seek; note cũ vẫn đọc được. Nếu không xác định được video/thời gian đáng tin cậy, không đoán timestamp.

Không cam kết panel hiển thị cạnh player khi player đang fullscreen, không điều khiển vị trí trái/phải của panel, và không tự thoát fullscreen.

## 4. Luồng sản phẩm

### Mở panel và chọn sổ

Bấm icon extension hoặc N đơn khi focus trang video YouTube để mở native panel. Không tự mở khi tải trang, không tự bắt đầu note. Panel theo tab active trong **cửa sổ chứa panel**, không theo tab của cửa sổ Chrome khác. Handler phím gọi open trước khi chờ database để giữ user gesture.

- Trên watch page hợp lệ: hiện tên video, sổ hiện tại, danh sách note và vùng ghi.
- Video chưa có sổ: hiện “Chọn cuốn sổ” và “Tạo cuốn sổ”; chưa cho bắt đầu note trước khi chọn thành công.
- Tạo sổ chỉ cần tên không rỗng; trim khoảng trắng đầu/cuối, tối đa 120 ký tự. Cho phép trùng tên vì ID, không phải tên, là định danh.
- Gán sổ được ghi bền vững ngay khi chọn; không cần video phải có note. Không tự chọn sổ gần nhất cho một video mới.
- Trang không hỗ trợ: hiện hướng dẫn mở video YouTube; vẫn có nút “Cuốn sổ” để đọc dữ liệu đã lưu.
- Extension vừa cài trên tab YouTube đã mở: nếu chưa có content script, hướng dẫn tải lại tab thay vì âm thầm xin thêm quyền inject.

Chọn “Đổi sổ” là chuyển toàn bộ video và note sang sổ mới, không sao chép note. Xác nhận rõ số note bị chuyển. Nếu có nháp đang sửa, yêu cầu lưu hoặc hủy nháp trước; không tự đổi sổ dưới một nháp. Mọi request nháp/lưu kiểm tra lại revision của gán sổ để chặn thay đổi từ cửa sổ khác.

### Bắt đầu, nhập và lưu

- “Ghi chú mới” hoặc lần focus đầu tiên vào editor trống khởi tạo nháp sau khi lấy snapshot mới từ đúng player. Editor chỉ nhận chữ sau khi timestamp/identity đã xác định; focus lặp lại không đổi timestamp.
- Timestamp là số giây `currentTime` hữu hạn, không âm; giữ giá trị chính xác trong dữ liệu, hiển thị mm:ss hoặc h:mm:ss bằng phần nguyên. Không dùng thời gian bấm Lưu.
- Mở bằng icon/N hoặc ghi thủ công không tự pause/resume. Theo yêu cầu bổ sung: Option+N/Alt+N pause video chính, mở/focus editor và bắt đầu hoặc tiếp tục nháp. Timestamp mới lấy ở thời điểm pause, nháp cũ giữ timestamp. Enter trong chế độ ghi nhanh lưu thành công rồi mới resume đúng binding; lưu lỗi/hủy nháp không phát tiếp.
- Nháp giữ nguyên timestamp trong suốt lần viết. Lưu xong, lần viết tiếp theo lấy timestamp mới.
- Văn bản giữ xuống dòng và dấu tiếng Việt. Nội dung chỉ có khoảng trắng không được lưu thành note. Giới hạn đề xuất 50.000 ký tự/note; không cắt ngầm nội dung vượt giới hạn.
- Ghi nhanh Option+N: Enter lưu/phát tiếp, Shift+Enter xuống dòng. Ghi thủ công/reader: Cmd/Ctrl+Enter lưu, Enter xuống dòng. IME không submit. N đơn vẫn chỉ mở panel. N/Option+N bỏ qua ô gõ/contenteditable và repeat/IME; Shift+N cùng các modifier khác không bị chiếm. Không phải global shortcut/thanh địa chỉ.
- Lúc final save, đặt editor read-only ngay sau khi chụp snapshot, chỉ đến khi nhận kết quả; giữ focus/selection, không dựng lại editor. Chỉ hiện “Đã lưu” sau khi transaction thành công.
- Final save thất bại: bỏ read-only, giữ nội dung/timestamp, hiện lỗi và cho thử lại. Request lặp lại dùng cùng note ID để không tạo bản trùng.

### Nháp và chuyển tab/video

Nháp khác note đã lưu. Mỗi phiên editor có writer ID; mỗi nháp có ID và revision tăng dần. Gửi cập nhật nháp trên mỗi input, tuần tự theo writer; không chờ đóng panel mới bắt đầu ghi. Phân biệt “Đang giữ nháp”, “Nháp đã được giữ” và lỗi; chỉ xác nhận sau commit.

- Chuyển video/tab: ngừng nhận input cho binding cũ, gửi phần nháp cuối, rồi gắn editor với binding mới. Reply cũ không được đổi nội dung hoặc trạng thái của video mới.
- Đóng panel, worker ngủ hoặc khởi động lại Chrome: các phiên bản nháp đã commit có thể khôi phục. Không hứa giữ ký tự chưa commit khi tiến trình bị đóng đột ngột.
- Không dựa vào `unload`/`beforeunload` để bảo đảm lưu cuối cùng. Lỗi ghi giữ nội dung trong panel đang mở và cảnh báo người dùng chưa đóng panel; không được báo đã bảo vệ nháp.
- Mở lại: hiện nháp có sẵn của video. Một bản thì cho tiếp tục; nhiều writer thì cho chọn bản theo thời gian/nội dung xem trước. Không tự trộn hoặc ghi đè nháp khác.
- Khôi phục nháp là tạo working copy cho writer mới; chỉ thay bản khôi phục khi working copy đã commit. Writer cũ tiếp tục viết vẫn không được ghi đè writer mới.
- “Hủy nháp” có xác nhận nếu có chữ. Final save tạo/cập nhật note và xóa đúng phiên bản nháp trong cùng transaction. Nháp khác không bị xóa.

Nháp có membership revision cũ sau khi video bị chuyển sổ từ cửa sổ khác vẫn phải đọc được. Báo sổ hiện tại và cho người dùng xác nhận gắn lại nháp với sổ mới trước khi tiếp tục; giữ video/timestamp/text, không ghi tự động bằng revision cũ. Khi đó thao tác rebind tạo revision nháp mới trong transaction và chỉ thành công nếu membership chưa thay đổi lần nữa.

### Sửa và xóa note

Sửa giữ nguyên video và timestamp, chỉ thay văn bản. Editor sửa cũng có nháp; một panel chỉ có một editor active. Nếu đang có nháp khác, phải lưu/hủy trước khi chuyển editor.

Mỗi note có revision. Sửa/xóa dùng expected revision. Nếu note đã được sửa hoặc xóa ở cửa sổ khác, báo xung đột, giữ bản đang nhập để người dùng sao chép, tải lại bản mới để xem; không ghi đè, không tự phục hồi note đã xóa và không cần xây công cụ merge.

Xóa note cần xác nhận, chỉ bỏ dòng sau commit. Nháp sửa từ một writer khác không bị xóa theo; khi phục hồi phải báo note gốc không còn tồn tại.

### Đọc và tìm trong cuốn sổ

Nút “Cuốn sổ” mở hoặc focus một tab extension. Trang này có danh sách sổ, danh sách video của sổ đã chọn và vùng đọc. Trên bề ngang nhỏ, các phần xếp dọc; không dựng cửa sổ Chrome giả.

- Danh sách video có tiêu đề và link chuẩn tới YouTube; video trùng tiêu đề vẫn được phân biệt bằng video ID/link.
- Có chế độ đọc tất cả video trong sổ hoặc một video. Video sắp theo thời điểm thêm vào sổ; note sắp timestamp tăng dần, sau đó createdAt và ID để ổn định.
- Tìm trong văn bản note của sổ đang chọn, không gọi YouTube search. Không phân biệt hoa/thường, chuẩn hóa Unicode NFC và giữ phân biệt dấu tiếng Việt. Query rỗng trả lại chế độ đọc bình thường.
- Kết quả nhóm theo video, hiển thị nguyên note và timestamp. Search không xóa bộ lọc video đã chọn; kết quả rỗng có giải thích.
- Video private/đã xóa hoặc không có mạng vẫn còn note để đọc/sửa. Không tự xóa dữ liệu khi không tải được video.

### Bấm timestamp

Từ panel: chỉ điều khiển đúng tab/video đang được hiển thị, sau khi xác thực lại binding. Không tự chuyển sang video khác nếu binding đã lỗi thời.

Từ cuốn sổ: ưu tiên tab cùng video trong cửa sổ chứa cuốn sổ; nếu có nhiều tab, ưu tiên tab active, rồi tab có index nhỏ nhất. Nếu không có tab phù hợp, mở watch URL mới ở cửa sổ đó, không điều hướng đè lên video khác. Focus tab đích.

Content script nhận yêu cầu seek phải kiểm tra lại video ID, document và navigation generation; chờ metadata hợp lệ rồi pause và seek. Nếu video ngắn hơn timestamp, seek tới cuối khoảng khả dụng; timestamp gốc của note không bị sửa. Không seek vào quảng cáo hoặc media live. Nếu chưa sẵn sàng sau tối đa 15 giây, báo lỗi và giữ note nguyên vẹn, không retry nền vô hạn.

Pending seek khi phải mở tab được giữ bền vững với request ID, tab ID, video ID, thời hạn và generation sau handshake; worker restart không biến nó thành lệnh cho tab khác. Navigation không khớp, tab đóng, hoặc request bị thay thế thì hủy. Thành công chỉ sau acknowledgement đúng request từ player; link có `t=` không tự được coi là bằng chứng đã seek/pause.

## 5. Bề mặt và trạng thái giao diện

Hai bề mặt khác nhiệm vụ, dùng chung tokens và primitives, không dùng chung một component màn hình khổng lồ:

- **Panel thao tác:** tiêu đề video thực; selector sổ và nút Cuốn sổ; lỗi/trạng thái; note theo timestamp; editor và Lưu. Vùng note có scroll giới hạn để không đẩy editor khỏi tầm với.
- **Trang đọc:** selector sổ/tạo/đổi tên; tìm kiếm; danh sách video; nội dung nhóm theo video. Có empty state tạo sổ/thêm video, không dữ liệu minh họa.

System font, phân cấp chữ tiết chế, timestamp tabular, focus ring rõ, lỗi không chỉ bằng màu, status live region không ngắt nhập. Note dùng `textContent`, giữ whitespace và wrap chữ/link dài. Không nhúng ảnh thumbnail từ server chỉ để trang trí, không gradient/animation gây xao nhãng. Mục tiêu panel dùng được từ rộng 320px và khi chiều cao hạn chế; ưu tiên wrap/scroll thay vì ẩn hành động.

Phải có các trạng thái: trang không hỗ trợ, chưa chọn sổ, chờ player, đang quảng cáo/live, chưa có note, loading, đang lưu, lỗi lưu/nháp, nháp khôi phục, xung đột revision, và dữ liệu/schema không thể đọc an toàn.

## 6. Kiến trúc đề xuất

### Toolchain

Manifest V3, TypeScript strict, Vite, HTML/CSS và DOM thuần. Không React hoặc UI framework vì hai bề mặt nhỏ và ưu tiên ít phụ thuộc runtime. Dùng npm với lockfile; đề xuất Node 22+ cho phát triển. Công cụ test đề xuất Vitest và fake IndexedDB cho các invariant transaction; smoke Chrome vẫn bắt buộc.

Minimum Chrome đề xuất 116 do `sidePanel.open()` xuất hiện từ phiên bản này. API floor không phải chứng nhận đã chạy Chrome 116; release phải nêu riêng phiên bản thực sự smoke. Nếu cần API mới hơn trong triển khai, phải cập nhật minimum và tài liệu, không gọi API mới không kiểm tra.

### Trách nhiệm

- **Content script:** đọc identity/title/currentTime từ đúng player, báo thay đổi page/player, thực hiện pause/seek đã xác thực. Không đọc/ghi notebook database và không nhận lệnh qua `window.postMessage` từ trang.
- **Service worker:** định tuyến theo window/tab/document, kiểm tra sender/payload, quản lý thao tác tab/panel, thực hiện domain commands và persistence. Đăng ký event listeners ở top level; không dựa vào global state để khôi phục dữ liệu.
- **Domain:** định danh, normalization, notebook membership, revision, validation, draft/save transitions; không phụ thuộc DOM hay Chrome API.
- **Persistence:** IndexedDB transaction, schema version và migration; commit mới là ranh giới xác nhận. Không await network/Chrome API trong transaction đang mở.
- **Panel và notebook page:** state/render riêng, gửi command có request ID, bỏ reply stale, không trực tiếp sửa database. Sau commit, thông báo invalidation cho các bề mặt; mỗi lần mở/focus/reconnect phải đọc snapshot mới, không dựa duy nhất vào broadcast.

Không cần định trước từng tên file trong bước thiết kế; người lập kế hoạch sẽ chia module theo các ranh giới này, tránh lớp abstraction không có consumer.

### Messages và YouTube navigation

Command mutation chứa request ID, entity identity, expected revision nếu có và payload đã validate. Response echo request ID và identity, thành công có revision; lỗi có mã hữu hạn và thông điệp cho người dùng.

Sender content script chỉ được báo player hoặc trả lời snapshot/seek; không có quyền gọi notebook CRUD. Kiểm tra extension ID, top frame, origin YouTube và tab/document từ `MessageSender`, không tin tab ID tự khai trong payload. Chỉ các trang extension biết trước được gọi mutation.

Mỗi content script có document token và generation tăng khi video thay đổi. Quan sát URL qua các tín hiệu navigation và DOM/player thực tế; sự kiện riêng của YouTube chỉ là tín hiệu đánh thức, không là nguồn duy nhất. Dọn listeners khi player bị thay và không poll toàn DOM liên tục. Snapshot phải có video ID khớp URL, timestamp sẵn sàng, trạng thái media và generation. Không nhận nhầm title của video trước khi SPA cập nhật xong.

Panel lấy window ID của chính nó; active-tab changes và replies đều đối chiếu window ID, tab ID, document token, video ID và generation. Title có thể cập nhật sau mà không đổi ID của note. Chỉ lấy metadata cho video được người dùng gán sổ hoặc ghi; không lưu lịch sử toàn bộ các video từng mở.

### Dữ liệu và transaction

IndexedDB có schema version ở database; các entity dùng UUID trừ `videoId` là ID YouTube. Thời gian entity là UTC ISO-8601 do extension tạo.

- `Notebook`: id, name, createdAt, updatedAt, revision.
- `Video`: videoId, notebookId, title (fallback video ID), addedAt, updatedAt, revision. Mỗi video thuộc đúng một sổ; video ID là unique key toàn database. Revision ở đây là membership revision: chỉ tăng khi đổi sổ, không tăng vì title/metadata cập nhật, để không vô hiệu hóa nháp đang nhập.
- `Note`: id, videoId, timestampSeconds, text, createdAt, updatedAt, revision.
- `Draft`: id, writerId, videoId, videoRevision, timestampSeconds, text, revision, updatedAt; khi sửa có noteId và expectedNoteRevision. Draft ID làm note ID cho thao tác tạo mới.
- `PendingSeek`: requestId, targetTabId, videoId, timestampSeconds, document/generation sau handshake, expiresAt; chỉ dữ liệu điều phối, không phải note.

Các index tối thiểu phục vụ video theo notebook, note theo video và draft theo video/writer. Chỉ load dữ liệu của sổ được chọn để search; chưa cần full-text engine hoặc backend.

Tạo/gán video kiểm tra notebook tồn tại. Đổi sổ cập nhật video revision trong transaction; note đi theo video, không phải copy. Final save kiểm tra membership, revision của note và draft; commit note và xóa đúng draft cùng transaction. Xung đột abort toàn bộ, không thành công một nửa.

Một request tạo note lặp lại có cùng draft/note ID: nếu bản lưu đã tồn tại và giống payload, trả thành công hiện tại; nếu nội dung/revision khác, báo conflict, không overwrite. Timestamp đầu vào hữu hạn và không âm; text và giới hạn độ dài được kiểm tra tại worker, không chỉ UI.

Lỗi quota, transaction abort hoặc open database đều phải hiển thị. Schema mới hơn app hoặc migration lỗi: chặn ghi, giữ database, hiển thị hướng dẫn; không delete database/tạo notebook rỗng để che lỗi. Chưa có migration dữ liệu người dùng từ IINA.

## 7. Quyền, riêng tư và độ bền

Manifest đề xuất chỉ xin `sidePanel` và host permission `https://www.youtube.com/*`; static content script khớp cùng origin, chỉ top frame. Host permission cần để nhận diện/query tab YouTube sau khi đổi tab và tìm tab khi bấm timestamp. Không xin `<all_urls>`, `tabs`, `scripting`, `downloads`, `unlimitedStorage`, `history`, cookies, hoặc quyền đọc file. IndexedDB không đòi quyền `storage`.

Trang cuốn sổ dùng `chrome.tabs` để mở/focus tab; hầu hết thao tác Tabs API không cần quyền `tabs`, host permission YouTube đủ cho URL nhạy cảm của các tab phù hợp. Nếu triển khai phát hiện thiếu quyền, phải nêu capability cụ thể trước khi thêm.

Không gửi note hoặc lịch sử video về máy chủ; không thêm analytics, remote executable code, font/icon mạng hay CDN runtime. YouTube vẫn có các kết nối do chính trang YouTube tạo. Nội dung user/page không trở thành HTML executable; chỉ dựng link từ video ID hợp lệ và origin cố định.

Dữ liệu ở Chrome profile của extension, không phải folder course và không đồng bộ giữa các profile/máy. Xóa extension hoặc mất profile có thể mất note/nháp. Cài release mới phải cập nhật đúng extension hiện có; đổi extension ID hoặc gỡ/cài lại không được hứa giữ dữ liệu. Hướng dẫn cài unpacked phải cảnh báo rõ trước khi người dùng ghi note quan trọng.

Không hỗ trợ incognito trong phạm vi này; manifest đặt chế độ không cho chạy incognito để tránh trộn dữ liệu hoặc kỳ vọng sai về riêng tư. Không hứa chịu được mọi sự cố nguồn điện/ổ đĩa; chỉ xác nhận những write IndexedDB đã commit.

## 8. Open source và phát hành

Tên hiển thị đã duyệt: “Chudin Note for YouTube”; license MIT; README tiếng Việt và hướng dẫn contributor đủ để build độc lập. LICENSE sẽ được tạo khi triển khai, không coi việc duyệt tài liệu là file license đã tồn tại.

Trước release phải có README (phạm vi/thao tác/giới hạn/quyền/dữ liệu), LICENSE đã duyệt, CONTRIBUTING, CHANGELOG, RELEASING và hướng dẫn báo lỗi không đính kèm note riêng tư. Không phụ thuộc `../note-iina` hoặc công cụ agent local.

Bản GitHub Release là ZIP build unpacked: tải → giải nén → `chrome://extensions` → Developer mode → Load unpacked. Không quảng bá như file tự cài đã ký, không hứa auto-update. Update bằng build mới trong cùng folder và Reload extension; không gỡ extension để cập nhật. Người dùng xác nhận không cần Chrome Web Store; không xây quy trình Store.

Version đồng nhất manifest/package/tag `vX.Y.Z`, build từ lockfile, chỉ đóng gói runtime assets. CI trên pull request chạy typecheck, behavioral tests và build; chưa tự publish release hoặc submit Store. Chỉ push/publish khi người dùng yêu cầu.

## 9. Tiêu chí nghiệm thu sau triển khai

Không đánh dấu hoàn thành chỉ vì test/build pass. Người dùng tự load build vào Chrome, báo phiên bản Chrome/OS, bước đã thử và kết quả; trợ lý không điều khiển máy/browser để nghiệm thu. Ghi rõ bằng chứng do người dùng báo và giới hạn chưa thử.

1. Icon mở native panel cạnh một watch page; trang khác hiện thông báo đúng, không ghi nhầm video cũ.
2. Tạo hai sổ; gán video A và B vào sổ thứ nhất, video C vào sổ thứ hai. Các sổ hiển thị đúng dữ liệu và không tự gom theo playlist.
3. Bắt đầu nháp ở 01:20, tiếp tục phát/nhập rồi lưu ở thời điểm khác; note vẫn gắn 01:20. IME, xuống dòng, chữ N và Cmd/Ctrl+Enter đúng hành vi.
4. Đóng/mở panel và khởi động lại Chrome sau khi báo đã giữ nháp/đã lưu; dữ liệu được khôi phục đúng video. Nháp chưa commit không bị hứa là đã giữ.
5. SPA A→B, đổi qua lại hai tab và hai cửa sổ khi có nháp/pending reply; không mất bản đã commit, không tráo nội dung/timestamp/sổ.
6. Đọc toàn sổ/theo video, tìm tiếng Việt có dấu, query rỗng và không có kết quả. Video trùng title không dùng chung note.
7. Bấm timestamp từ panel và cuốn sổ: đúng video/tab, pause/seek; chưa có tab thì mở tab mới, không phá tab khác. Người dùng đổi video giữa chừng thì request cũ bị hủy.
8. Sửa/xóa note có revision conflict, retry save cùng ID, nhiều writer có nháp riêng; không overwrite hoặc nhân đôi note.
9. Đổi sổ chuyển toàn video/note một lần; thao tác từ panel cũ gặp revision conflict, không ghi vào sổ sai.
10. Worker restart, lỗi transaction/quota, database không tương thích: báo lỗi, không giả thành công, không xóa dữ liệu. Dùng tình huống inject lỗi có kiểm soát trong smoke, không làm hỏng profile thật.
11. Loading player, quảng cáo/live, unsupported pages, video mất quyền truy cập và mất mạng có trạng thái đúng; vẫn đọc được dữ liệu local.
12. Narrow panel, sáng/tối, keyboard/focus và IME được thử trên giao diện thật; không chỉ screenshot của trang mô phỏng.
13. Build ZIP từ clean checkout, kiểm tra nội dung archive, cài unpacked theo README và thử nâng cấp không gỡ extension; không chứa secrets hoặc private tooling.

Regression tests lâu dài chỉ bảo vệ hành vi/invariant: transaction save+draft, idempotency, revisions, Unicode search, identity và stale navigation. Không test text source, wiring, mock echo hay wording mặc định.

## 10. Những việc còn giao cho người lập kế hoạch

Kế hoạch đã định nghĩa module/interfaces và được duyệt; package.json/package-lock.json chứa dependency versions đã cài bằng build tooling do người dùng cho phép. Command smoke không browser đã thực hiện; native Chrome còn chờ người dùng. Không được thay product scope, nới quyền hoặc bỏ tiêu chí nghiệm thu để làm build dễ hơn.

Đã được duyệt: một video chỉ thuộc một sổ; đọc/tìm ở tab cuốn sổ; sửa/xóa note; local-only chưa export/backup; giao diện tiếng Việt; tên “Chudin Note for YouTube” và MIT. Hạn chế thao tác máy/browser do người dùng bổ sung áp dụng cả khi triển khai, review và nghiệm thu.

## 11. Nguồn kỹ thuật

- Chrome Side Panel API, user gesture và mốc `open()` Chrome 116: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Tabs API và ranh giới permission: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Service-worker lifecycle, global state và persistent storage: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Tham chiếu sản phẩm: https://github.com/Chudien-2923/note-iina
