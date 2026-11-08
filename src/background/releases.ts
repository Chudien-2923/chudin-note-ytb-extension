import { AppError } from "../domain/types";
import type { ReleaseCheckResult } from "../shared/releases";

const REPO = "https://github.com/Chudien-2923/chudin-note-ytb-extension";
const LATEST_RELEASE_API = "https://api.github.com/repos/Chudien-2923/chudin-note-ytb-extension/releases/latest";
const TIMEOUT_MS = 10_000;
const COMPONENT = "(0|[1-9][0-9]{0,4})";
const INSTALLED_VERSION = new RegExp(`^${COMPONENT}\\.${COMPONENT}\\.${COMPONENT}$`);
const RELEASE_TAG = new RegExp(`^v?${COMPONENT}\\.${COMPONENT}\\.${COMPONENT}$`);
const MAX_COMPONENT = 65_535;

type Version = [number, number, number];

const failed = (message: string) => new AppError("RELEASE_CHECK_FAILED", message);
const retryLater = () => failed("Không thể kiểm tra bản phát hành lúc này. Ghi chú vẫn an toàn; hãy thử lại sau.");
const unusable = () => failed("Thông tin bản phát hành từ GitHub không hợp lệ hoặc chưa sẵn sàng. Hãy thử lại sau.");

function parseVersion(pattern: RegExp, text: string): Version | undefined {
  const match = pattern.exec(text);
  if (!match) return undefined;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= MAX_COMPONENT) ? (parts as Version) : undefined;
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseRelease(data: unknown): { tag: string; version: Version } {
  if (!isRecord(data) || data.draft !== false || data.prerelease !== false || typeof data.tag_name !== "string") throw unusable();
  const tag = data.tag_name;
  const version = parseVersion(RELEASE_TAG, tag);
  if (!version || !Array.isArray(data.assets)) throw unusable();
  const numeric = version.join(".");
  const assetName = `chudin-note-youtube-${numeric}.zip`;
  const expectedUrl = `${REPO}/releases/download/${tag}/${assetName}`;
  const installable = data.assets.some(
    (asset) => isRecord(asset) && asset.name === assetName && asset.state === "uploaded" && asset.browser_download_url === expectedUrl,
  );
  if (!installable) throw unusable();
  return { tag, version };
}

export async function checkGitHubRelease(installedVersion: string, fetcher: typeof fetch = fetch): Promise<ReleaseCheckResult> {
  const installed = parseVersion(INSTALLED_VERSION, installedVersion);
  if (!installed) throw failed("Không xác định được phiên bản đang cài đặt, nên chưa thể so sánh bản phát hành.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response: Response;
    let data: unknown;
    try {
      response = await fetcher(LATEST_RELEASE_API, {
        method: "GET",
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 404) return { state: "unpublished" };
      if (!response.ok) {
        throw response.status === 403 || response.status === 429
          ? failed("GitHub đang giới hạn số lượt kiểm tra. Hãy thử lại sau ít phút.")
          : retryLater();
      }
      data = await response.json();
    } catch (error) {
      throw error instanceof AppError ? error : retryLater();
    }

    const { tag, version } = parseRelease(data);
    const latestVersion = version.join(".");
    const order = compare(installed, version);
    if (order === 0) return { state: "current", latestVersion };
    if (order > 0) return { state: "ahead", latestVersion };
    return { state: "available", latestVersion, releaseUrl: `${REPO}/releases/tag/${tag}` };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
