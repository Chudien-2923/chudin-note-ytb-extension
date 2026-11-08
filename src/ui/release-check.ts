import type { ReleaseCheckResult } from "../shared/releases";
import { AppError } from "../domain/types";
import type { Client } from "./client";
import { element, setStatus, type Mounted } from "./shared";

const RELEASE_TAG_PATH = "/Chudien-2923/chudin-note-ytb-extension/releases/tag/";
const VERSION = /^\d+\.\d+\.\d+$/;
const TAG = /^v?(\d+\.\d+\.\d+)$/;
const GENERIC_FAILURE =
  "Chưa kiểm tra được bản phát hành. Kiểm tra kết nối mạng rồi thử lại.";
const INVALID_REPLY =
  "Phản hồi kiểm tra bản phát hành không hợp lệ. Thử lại sau.";

/** Returns the official release-page URL only when it is the fixed repository's tag page for `version`. */
function officialReleaseUrl(value: unknown, version: string): string | undefined {
  if (typeof value !== "string" || value.length > 300) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(RELEASE_TAG_PATH)
  )
    return undefined;
  const tag = TAG.exec(url.pathname.slice(RELEASE_TAG_PATH.length));
  return tag?.[1] === version ? url.href : undefined;
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}

/**
 * Manual release check: nothing runs until the user presses the button, and the
 * result is only ever an informational message plus a link the user may open.
 */
export function mountReleaseCheck(
  root: HTMLElement,
  client: Client,
  installedVersion: string,
): Mounted {
  const section = element("section", "release-check");
  section.setAttribute("aria-label", "Phiên bản và bản phát hành");
  const version = element("span", "release-check-version");
  version.append("Phiên bản đã cài ", element("strong", "", installedVersion));
  const control = element("button", "quiet", "Kiểm tra bản phát hành");
  control.type = "button";
  const head = element("div", "release-check-head");
  head.append(version, control);
  const status = element("p", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const offer = element("div", "release-check-offer");
  const note = element(
    "small",
    "",
    "Cập nhật thủ công: tải ZIP, giải nén đè đúng thư mục cũ rồi Reload trong chrome://extensions. Không gỡ tiện ích; giữ cùng thư mục, ID và Chrome profile để tiếp tục dùng ghi chú cũ. Không tự tải hay cài bản mới.",
  );
  section.append(head, status, offer, note);

  let pending = false;
  let disposed = false;

  function show(result: ReleaseCheckResult): void {
    switch (result?.state) {
      case "current":
        if (isVersion(result.latestVersion))
          return setStatus(
            status,
            `Bạn đang dùng bản mới nhất (${result.latestVersion}).`,
          );
        break;
      case "ahead":
        if (isVersion(result.latestVersion))
          return setStatus(
            status,
            `Bản đang cài (${installedVersion}) mới hơn bản phát hành công khai mới nhất (${result.latestVersion}). Đây có thể là bản đang phát triển.`,
          );
        break;
      case "unpublished":
        return setStatus(
          status,
          "Chưa có bản phát hành công khai nào trên GitHub để so sánh.",
        );
      case "available": {
        if (!isVersion(result.latestVersion)) break;
        const href = officialReleaseUrl(result.releaseUrl, result.latestVersion);
        if (!href) break;
        setStatus(
          status,
          `Có bản mới ${result.latestVersion} (bạn đang dùng ${installedVersion}).`,
        );
        const link = element(
          "a",
          "",
          `Mở trang bản phát hành ${result.latestVersion}`,
        );
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        offer.append(link);
        return;
      }
    }
    setStatus(status, INVALID_REPLY, "error");
  }

  async function check(): Promise<void> {
    if (pending || disposed) return;
    pending = true;
    const hadFocus = document.activeElement === control;
    offer.replaceChildren();
    setStatus(status, "Đang kiểm tra bản phát hành…");
    control.disabled = true;
    try {
      const result = await client.call("checkRelease", {});
      if (disposed) return;
      show(result);
    } catch (error) {
      if (disposed) return;
      setStatus(
        status,
        error instanceof AppError && error.message
          ? error.message
          : GENERIC_FAILURE,
        "error",
      );
    } finally {
      pending = false;
      if (!disposed) {
        control.disabled = false;
        // Return focus only if it was lost with the disabled control; never pull it from a note draft.
        const active = document.activeElement;
        if (
          hadFocus &&
          (!active || active === document.body || active === control)
        )
          control.focus();
      }
    }
  }

  const onClick = (): void => void check();
  control.addEventListener("click", onClick);
  root.append(section);
  return {
    dispose() {
      disposed = true;
      control.removeEventListener("click", onClick);
      section.remove();
    },
  };
}
