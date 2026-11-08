# Chudin Note for YouTube

Ghi lại điều bạn hiểu khi xem YouTube, rồi đọc và tìm lại theo cuốn sổ. Lấy cảm hứng từ [note-iina](https://github.com/Chudien-2923/note-iina); không cần cài IINA để sử dụng.

## Chức năng

- Mở panel bên phải **trong trang YouTube** bằng icon extension hoặc **N**, tạo/chọn cuốn sổ cho video. Không dùng native side panel của Chrome.
- **Option + N** (Windows/Linux: Alt + N): pause và đưa con trỏ vào ô ghi chú hiện tại. Note mới lấy mốc **lùi 20 giây**, chặn tại 00:00; ví dụ bấm ở 12:00 → note 11:40, video vẫn pause ở 12:00. **Enter** lưu xong mới phát tiếp; **Shift + Enter** xuống dòng.
- **Option + Command + N** trên Mac: đóng panel, kể cả khi đang ở ô ghi chú; giữ nguyên nháp. Không tự lưu thành note, hủy nháp hoặc đổi trạng thái phát video. Không chiếm phím trong lúc IME đang ghép dấu.
- Ghi thủ công bằng **Ghi chú mới** lấy timestamp tại lúc bắt đầu, không phải lúc bấm Lưu. Tiếp tục nháp cũ luôn giữ nguyên mốc và chữ.
- Viết nhiều dòng, lưu bằng **Lưu ghi chú** hoặc **Cmd/Ctrl + Enter**; nháp được giữ riêng trên máy.
- Sửa/xóa note, khôi phục nháp, chuyển video cùng các note sang sổ khác.
- Mở **Cuốn sổ** để đọc theo video hoặc toàn sổ, tìm nội dung tiếng Việt.
- Bấm timestamp để mở/focus đúng video, pause và tua tới đoạn đã ghi.
- Khi fullscreen, video/phụ đề/điều khiển được bố trí bên trái và panel bên phải; ảnh video giữ tỷ lệ, không bị panel phủ lên. Đóng panel trả lại vùng xem ban đầu; lưu note không tự đóng panel.
- Từ **0.2.0**: xem phiên bản đang cài và bấm **Kiểm tra bản phát hành** ở cuối panel/Cuốn sổ. Nếu có bản mới hợp lệ, mở trang GitHub để tự tải ZIP; không tự tải/cài hoặc kiểm tra nền.

**N** đơn mở panel; icon bật/ẩn panel; cả hai không tự pause. **Option + N**: pause → tạo/tiếp tục nháp → focus ô nhập → Enter lưu thành công rồi phát tiếp đúng video. Note mới lùi mốc 20 giây; nháp cũ giữ nguyên. N/Option+N trong ô gõ/bình luận/search hoặc IME không bị chiếm; Shift+N giữ nguyên. Phím tắt chỉ hoạt động ở trang video/panel, không phải toàn hệ thống/thanh địa chỉ. Một video thuộc một sổ, không tự lấy playlist làm course.

## Trạng thái

**Đang phát triển 0.2.0 — chưa phát hành.** Bản công khai hiện tại là [v0.1.0](https://github.com/Chudien-2923/chudin-note-ytb-extension/releases/tag/v0.1.0), chưa có nút kiểm tra bản phát hành. Chủ repo đã xác nhận các luồng cơ bản và bản sửa kết nối của 0.1.0 hoạt động. Bản 0.2.0 đã qua typecheck, 259 behavioral tests, build/ZIP và command-line smoke; giao diện/nút mới trong Chrome thật còn chờ người dùng kiểm tra. Chưa chứng nhận mọi phiên bản Chrome/OS, IME hoặc từng trường hợp trong [checklist kiểm tra](docs/TESTING.md). Source code ZIP không thay cho build cài đặt.

## Cài từ bản ZIP GitHub

Dự án chỉ phân phối dạng unpacked qua GitHub, **không Chrome Web Store**, không file tự cài có chữ ký và không auto-update.

1. Tải [ZIP cài đặt v0.1.0 — `chudin-note-youtube-0.1.0.zip`](https://github.com/Chudien-2923/chudin-note-ytb-extension/releases/download/v0.1.0/chudin-note-youtube-0.1.0.zip). Source code ZIP tự tạo bởi GitHub **không phải** build cài đặt.
2. Giải nén vào một folder cố định, không xóa/đổi vị trí folder sau khi cài. Trong folder phải có `manifest.json`.
3. Tự mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked**, chọn folder chứa manifest.
4. Tải lại các tab YouTube đã mở trước khi cài. Ghim icon extension nếu muốn, bấm icon để mở panel.
5. Mở video thường, tạo/chọn sổ và bấm **Ghi chú mới**. Thử với note không quan trọng trước.

Chrome tối thiểu theo target build: **116**, không phải chứng nhận mọi phiên bản Chrome 116+ đã được thử. Panel nằm bên phải; nút **Đóng ghi chú** ẩn panel nhưng giữ ô nhập. Fullscreen chia vùng xem/ghi chú, panel ưu tiên 420px và không quá nửa chiều rộng viewport. Bố cục YouTube/Chrome thật của bản sửa vẫn cần người dùng kiểm tra.

### Nếu đang dùng source tại repository này

Cần **Node 22.13+ thuộc dòng 22, hoặc Node 24 LTS** và npm; môi trường đã chạy build hiện tại: Node 24.14.1/npm 11.11.0. Từ thư mục repository:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run pack
```

- Load unpacked: chọn **`dist/`**, không chọn thư mục source.
- Build hiện tại để tự cài/thử: **`artifacts/chudin-note-youtube-0.2.0.zip`**, chưa đăng GitHub Release.
- `build` tạo worker ESM, content script IIFE, HTML/CSS/JS và icon PNG từ SVG local; `pack` kiểm tra allowlist và version trước khi ZIP. `pack` không tự build lại: luôn build trước pack.

Không cần Node/npm để dùng ZIP đã build. Không có server để chạy.

## Sử dụng

| Việc cần làm | Thao tác |
| --- | --- |
| Mở panel | Bấm N khi focus trang video YouTube, hoặc bấm icon extension |
| Ghi nhanh không dùng chuột | Option + N → gõ → Enter lưu và phát tiếp; Alt + N trên Windows/Linux |
| Ghi ý mới | Chọn sổ → Ghi chú mới → viết → Lưu |
| Lưu từ bàn phím | Ghi nhanh: Enter lưu và phát tiếp; ghi thủ công/reader: Cmd/Ctrl + Enter lưu |
| Xuống dòng | Ghi nhanh: Shift + Enter; ghi thủ công/reader: Enter. IME Enter không lưu |
| Đọc nhiều video | Cuốn sổ → chọn sổ → Tất cả video hoặc một video |
| Tìm nội dung | Nhập vào ô tìm; không phân biệt hoa/thường, vẫn phân biệt dấu |
| Quay lại đoạn video | Bấm timestamp; player được pause và seek |
| Chuyển sổ | Đổi selector sổ trong panel và xác nhận; lưu/hủy nháp đang mở trước |
| Khôi phục | Chọn nháp trong panel, hoặc chọn video ở Cuốn sổ để xem nháp |

Chỉ “Đã lưu ghi chú” mới xác nhận note đã commit; “Nháp đã được giữ” chỉ xác nhận nháp. Nếu có lỗi, giữ panel mở và sao chép nội dung ra nơi an toàn trước khi đóng. Không hứa giữ ký tự chưa commit nếu Chrome/máy bị đóng đột ngột.

Nhiều tab/cửa sổ có thể có nháp riêng. Phục hồi nháp yêu cầu chọn rõ bản; không tự trộn. Nếu dữ liệu bị đổi ở nơi khác, thao tác stale bị chặn thay vì overwrite. Giữ/copy bản đang nhập, đọc bản mới rồi quyết định tiếp.

Ghi nhanh giữ nguyên nháp đang có, không reset timestamp hoặc tạo trùng. Khi mở lại panel, một nháp sẽ được phục hồi; nhiều nháp cần chọn bản muốn tiếp tục. Video chưa gán sổ thì pause và yêu cầu chọn sổ trước. Lưu lỗi: giữ chữ, không phát tiếp. Ghi đã lưu nhưng Chrome từ chối `play()` hoặc tab/video đổi: báo riêng và để người dùng bấm Play, không lưu lại note trùng. Không tự resume khi hủy nháp.

Option+N dùng phím vật lý N, kể cả macOS phát sinh dead key; không chặn dấu/chữ khi đang gõ. Nếu worker restart giữa yêu cầu mở/focus thì có thể cần bấm lại Option+N; nháp/note đã commit không phụ thuộc request tạm này.

### Nếu nút Ghi chú mới hoặc ô nhập bị khóa

Chọn sổ trước. Khi đang phát quảng cáo, extension cố ý không lấy timestamp quảng cáo để ghi cho video chính. Nút/ô nhập tự mở khi player chính sẵn sàng; tiêu đề lấy từ tên bài trên watch page, không từ tên quảng cáo. Nháp đã có vẫn sửa được. Nếu hết quảng cáo mà vẫn bị khóa, gửi ảnh trạng thái và phiên bản Chrome để chẩn đoán; không xóa dữ liệu/gỡ extension.

Sau mỗi lần cập nhật build: Reload **đúng extension đang cài** ở `chrome://extensions`, rồi tải lại tab YouTube để thay content script. Nếu không reload tab, phím N mới chưa được cài vào trang đó.

### Nếu panel báo không kết nối được

Bản sửa hiện tại xử lý trường hợp YouTube chuyển từ trang chủ sang video hoặc video A sang B mà không tải lại toàn trang: URL ban đầu của content script có thể còn là trang chủ/video cũ. Extension dùng URL tab hiện tại để kiểm tra video, vẫn xác thực đúng nguồn và document; không bỏ bảo vệ phiên.

Cập nhật build vào cùng folder cài đặt, Reload **đúng extension hiện có**, rồi tải lại tab YouTube. Không Remove, đổi extension ID hoặc xóa dữ liệu. Thử từ trang chủ bấm vào video → N/Option+N, sau đó chuyển sang video khác mà không reload trang. Ghi chú phải thuộc đúng video. Nếu vẫn lỗi, gửi thông báo cụ thể đang hiện; worker failures không còn bị thay bằng câu reload chung. Không chia sẻ session token hoặc nội dung ghi chú.

## Dữ liệu và riêng tư

Dữ liệu ở IndexedDB **trong Chrome profile của extension**, không nằm cùng folder video hay folder source.

- Không tài khoản, cloud sync, analytics hoặc backend; extension không gửi note/lịch sử video tới server. YouTube vẫn có kết nối của chính trang YouTube.
- Chỉ khi bấm **Kiểm tra bản phát hành**, worker gọi API GitHub công khai để đọc metadata bản mới nhất của repository cố định. Không gửi note, nháp, tên/ID video, cookie hay token xác thực; GitHub vẫn nhận IP và thông tin kết nối thông thường. Không kiểm tra định kỳ hoặc khi mở panel. Bấm liên kết bản phát hành sẽ mở website GitHub trong tab mới.
- Không lưu lịch sử mọi video đã xem: chỉ lưu video bạn chủ động gán sổ/ghi chú.
- **Chưa có export/import hoặc backup.** Mất Chrome profile, gỡ extension hoặc đổi extension ID có thể mất note/nháp. Không dùng làm bản lưu duy nhất của nội dung quan trọng.
- Quota/JSON/schema không hợp lệ phải báo lỗi, không tự reset dữ liệu rỗng. IndexedDB commit không phải bảo đảm chống mọi hỏng ổ đĩa/mất điện.
- Đổi máy hoặc profile không tự mang theo dữ liệu. Không có tương thích file note của IINA.

### Quyền

- Host `https://www.youtube.com/*`: đọc player/identity, đặt host của panel trong trang và tìm tab đúng video để tua. Static content script chỉ chạy top frame.
- Host `https://api.github.com/*`: worker kiểm tra bản phát hành của đúng repository khi người dùng bấm nút. Chrome cấp quyền theo host; mã chỉ gọi endpoint metadata cố định, không cung cấp chức năng fetch URL tùy ý từ trang YouTube.
- Không còn quyền `sidePanel`. Giao diện panel là iframe `chrome-extension://` cùng code đóng gói local, chỉ cho phép nhúng từ YouTube. Giao diện phải có phiên được worker xác thực theo tab/document mới đọc/ghi dữ liệu; không gửi note hoặc token ra trang YouTube.

Không xin `<all_urls>`, quyền lịch sử/cookie/file/download hoặc quyền `tabs` rộng. Không chạy incognito. Toàn bộ mã thực thi được đóng gói local; CSP chỉ cho kết nối API GitHub để đọc metadata, không tải/chạy mã extension từ mạng.

## Giới hạn hiện tại

Chỉ watch page video thường trên `www.youtube.com` (có thể mở trong playlist). Không hỗ trợ Shorts, embed, mobile YouTube, live/premiere đang phát trực tiếp/DVR hoặc ghi/tua trong quảng cáo. Chờ video thường trở lại; note cũ vẫn đọc được. DOM của YouTube có thể đổi và cần cập nhật extension.

Không AI/transcript, ảnh chụp, rich text, tags, xuất/nhập, xóa cả sổ hay đồng bộ. Video private/đã xóa không làm mất note local, nhưng không thể tua nếu YouTube không phát được video.

## Cập nhật an toàn

**Nâng cấp được, nhưng không tự động.** Theo dõi [GitHub Releases](https://github.com/Chudien-2923/chudin-note-ytb-extension/releases) để tải ZIP build khi có phiên bản mới. Giữ cùng Chrome profile, extension ID và folder cài đặt để tiếp tục dùng dữ liệu cũ; việc push source lên GitHub không cập nhật extension đã cài.

Từ 0.2.0, xem dòng **Phiên bản đã cài** và bấm **Kiểm tra bản phát hành** ở cuối panel hoặc Cuốn sổ. Nút chỉ đọc bản công khai mới nhất có ZIP cài hợp lệ: báo đang dùng bản mới nhất, có bản mới (kèm liên kết), bản đang cài mới hơn bản công khai, hoặc chưa có bản công khai. Mất mạng/hết hạn/GitHub giới hạn lượt kiểm tra phải báo lỗi; không coi là “đã mới nhất”. Không có token GitHub, không tự tải/cài.

Người dùng 0.1.0 cần cập nhật thủ công một lần khi 0.2.0 được phát hành để có nút này. Build 0.2.0 hiện mới hơn bản công khai 0.1.0 nên có thể báo đang dùng bản phát triển; không cần hạ phiên bản.

1. **Không gỡ extension.** Không xóa dữ liệu/profile.
2. Giải nén build mới đè nội dung vào **cùng folder cài đặt**, giữ đường dẫn ổn định.
3. Trong `chrome://extensions`, bấm **Reload** đúng extension hiện có, tải lại tab YouTube.
4. Kiểm tra ghi chú cũ trước khi viết nội dung quan trọng. Không downgrade nếu bản cũ không đọc được schema mới.

## Phát triển và đóng góp

Runtime: TypeScript + DOM thuần, không UI framework/backend. Domain, persistence, content script, worker, panel và reader có ranh giới riêng. Tests dùng fake-indexeddb/jsdom trong Node, không điều khiển Chrome.

[Đóng góp](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Phát hành](RELEASING.md) · [Nghiệm thu](docs/TESTING.md) · [MIT](LICENSE).

Khi báo lỗi: phiên bản extension/Chrome/OS, bước tái hiện, mong đợi/thực tế và error đã ẩn thông tin riêng tư. Không gửi note, token hoặc lịch sử xem cá nhân. Đây là dự án độc lập, không phải sản phẩm chính thức của YouTube/Google.
