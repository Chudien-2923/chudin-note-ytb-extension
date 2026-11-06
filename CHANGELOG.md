# Changelog

## 0.1.0 — Unreleased

- Panel ghi chú trong trang YouTube: iframe extension-origin xác thực theo tab/document, giữ giao diện/editor và IndexedDB cũ, thay native Chrome side panel để hỗ trợ focus bằng bàn phím.
- Cuốn sổ tự tạo, chọn/đổi tên/chuyển video; reader theo video/toàn sổ và tìm tiếng Việt.
- Nháp riêng từng writer, explicit save, note edit/delete, revision conflict và transactional persistence.
- Guarded pause/seek theo window/tab/document/video/navigation generation.
- Vietnamese UI, local assets, dark/light, keyboard và IME guards.
- Reproducible npm lockfile build, unpacked ZIP, MIT và CI check/package không publish.
- Review regressions: async editor initialization, stale draft recovery, edit-save retry, pendingUrl mới tạo, active-tab guard, frozen-channel timeout và timestamp ACK validation.
- N đơn mở panel khi focus trang video; không chặn text input, IME, repeat hoặc Shift+N. Icon bật/ẩn panel; trang không hỗ trợ mở Cuốn sổ.
- Sửa lấy nhầm tên quảng cáo thay tên bài và giữ thông báo quảng cáo sau khi video chính đã sẵn sàng; hướng dẫn rõ lý do khóa ghi chú trong quảng cáo. Không lấy timestamp quảng cáo.
- Option+N/Alt+N pause video chính, focus ô nhập và tạo/tiếp tục nháp. Note mới lùi mốc 20 giây, chặn tại 00:00 (12:00 → 11:40); nháp cũ không đổi. Enter phát tiếp chỉ sau durable save; Shift+Enter newline, IME không submit. Không play sai tab/video/navigation hoặc sau lỗi ghi.
- Fullscreen chia vùng video bên trái/panel bên phải thay vì đè lên hình và phụ đề; video giữ tỷ lệ bằng contain, title/caption/transport cùng vùng trái. Resize/fullscreen exit/close phục hồi layout, giữ nguyên iframe/nháp; Enter không tự ẩn panel.
- Option+Command+N trên Mac đóng panel từ trang hoặc textarea, giữ iframe/nháp và phục hồi bố cục; không toggle mở lại, không lưu/xóa note hay pause/resume; tôn trọng composition và repeat.

Command verification và command-line integration smoke đã chạy; **Chrome thật và review thị giác/native IME đang chờ người dùng nghiệm thu**. Chưa public release, không Chrome Web Store, không backup/export hoặc auto-update.
