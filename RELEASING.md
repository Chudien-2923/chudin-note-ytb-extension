# Phát hành qua GitHub

Git/tag/push/publish do maintainer thực hiện hoặc giao trợ lý bằng yêu cầu tường minh. Yêu cầu 2026-11-07 chỉ cho phép commit/push source, không gồm tag/GitHub Release/Store. Không Chrome Web Store, auto-publish hoặc auto-update. CI chỉ check và upload build artifact, không tạo GitHub Release.

## Gate trước release

1. Tất cả tiêu chí docs/TESTING.md có bằng chứng hoặc giới hạn được maintainer ghi rõ; không gọi release-ready khi core Chrome flows còn chưa thử.
2. README/CHANGELOG đúng chức năng/giới hạn, MIT/attribution có trong archive; không ghi một phiên bản Chrome là tested nếu chưa thử.
3. Đồng bộ package.json và manifest.json theo SemVer. Bản code hiện tại là 0.1.0; tag phát hành tương ứng sẽ là v0.1.0.
4. Từ clean checkout, chạy:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run pack
unzip -t artifacts/chudin-note-youtube-0.1.0.zip
unzip -l artifacts/chudin-note-youtube-0.1.0.zip
```

Đổi tên ZIP theo version thực khi nâng version. Archive root phải có manifest, HTML/JS/CSS/icon và LICENSE; không source, secrets, node_modules, sourcemaps, note dữ liệu hoặc công cụ local.

5. Tự cài ZIP đã giải nén trong profile thử nghiệm. Thử update **không gỡ extension**, đúng folder và ID. Kiểm tra ghi chú/nháp cũ rồi ghi note mới. Không thử migration phá dữ liệu trên profile chính.
6. Khi người dùng yêu cầu phát hành, maintainer commit/tag/push, tạo GitHub Release từ tag version tương ứng, đính kèm ZIP build (không nhầm Source code ZIP), mô tả phạm vi đã thử và hạn chế dữ liệu/không backup. Không đánh dấu ổn định dựa trên unit tests.

## Hướng dẫn người cài

Tải ZIP build → giải nén vào folder cố định → chrome://extensions → Developer mode → Load unpacked. Khi update, thay files trong cùng folder rồi Reload đúng extension; không remove extension, không đổi ID/profile. Unpacked extension không được cập nhật tự động.

Không đưa release key/token/Chrome profile hoặc dữ liệu cá nhân vào repo, CI logs hoặc artifact. Không sửa schema chỉ để che lỗi; không hướng dẫn người dùng xóa database như một cách nâng cấp.
