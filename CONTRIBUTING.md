# Đóng góp

Issue/PR được chào đón. Đọc README, AGENTS.md, PRODUCT.md và thiết kế đã duyệt trước khi thay đổi hành vi.

## Phát triển

Node 22.13+ thuộc dòng 22, hoặc Node 24 LTS; dùng npm và commit package-lock.json khi đổi dependency. Không cần repo note-iina, server hoặc công cụ agent local.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run pack
```

Load `dist/` trong Chrome theo README và ghi lại các thao tác thực tế đã thử. Unit/DOM tests không thay thế Chrome integration. Browser/desktop automation bị cấm trong phiên phát triển của chủ repo; nhờ người dùng tự kiểm tra theo docs/TESTING.md.

## PR

- Giới hạn đúng thay đổi, mô tả hành vi và bằng chứng kiểm tra; không coi code review là runtime PASS.
- Giữ note/draft atomic commit, expected revisions, writer isolation, window/tab/document/video/generation identity. Không reset dữ liệu khi lỗi.
- Regression bảo vệ boundary consumer-visible, không test wording/source text/mock echo hoặc snapshot giao diện để khóa implementation.
- UI text tiếng Việt, hỗ trợ IME/keyboard, note chỉ render plain text. Không network assets hoặc remote code.
- Đổi schema phải có migration và từ chối downgrade an toàn. Thay quyền/scope cần giải thích và duyệt trước.
- Cập nhật README/CHANGELOG khi đổi hành vi; đồng bộ manifest/package version khi maintainer quyết định release.
- Không commit secrets, .env, private notes, node_modules, dist, artifacts hoặc công cụ agent local.

## Báo lỗi

Gửi extension/Chrome/OS version, bước tái hiện, mong đợi và thực tế. Chỉ dùng note/video mẫu đã ẩn thông tin riêng tư; không gửi toàn database hoặc profile thật. Báo lỗi bảo mật bằng kênh riêng cho maintainer nếu có thông tin nhạy cảm, không đăng token lên issue công khai.

Đóng góp theo MIT; không copy code/assets bên ngoài khi chưa kiểm tra license và attribution.
