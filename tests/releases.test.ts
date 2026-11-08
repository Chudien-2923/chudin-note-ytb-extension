import { afterEach, expect, it, vi } from "vitest";
import { checkGitHubRelease } from "../src/background/releases";

const repo = "https://github.com/Chudien-2923/chudin-note-ytb-extension";
function release(version = "0.3.0") {
  const name = `chudin-note-youtube-${version}.zip`;
  return {
    tag_name: `v${version}`, draft: false, prerelease: false,
    assets: [{ name, state: "uploaded", browser_download_url: `${repo}/releases/download/v${version}/${name}` }],
  };
}
const respond = (data: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(data), { status })) as typeof fetch;
afterEach(() => vi.useRealTimers());

it.each([
  ["0.9.0", "0.10.0", "available"],
  ["0.10.0", "0.10.0", "current"],
  ["0.10.1", "0.10.0", "ahead"],
  ["1.0.0", "0.99.99", "ahead"],
])("compares installed %s against release %s numerically", async (installed, latest, state) => {
  const result = await checkGitHubRelease(installed, respond(release(latest)));
  expect(result).toMatchObject({ state, latestVersion: latest });
  if (state === "available") expect(result).toHaveProperty("releaseUrl", `${repo}/releases/tag/v${latest}`);
});

it("never follows an arbitrary release-page URL supplied by GitHub metadata", async () => {
  expect(await checkGitHubRelease("0.2.0", respond({ ...release(), html_url: "https://evil.test/" }))).toEqual({
    state: "available", latestVersion: "0.3.0", releaseUrl: `${repo}/releases/tag/v0.3.0`,
  });
});

it.each([
  ["a prerelease", { ...release(), prerelease: true }],
  ["a draft", { ...release(), draft: true }],
  ["an invalid version", { ...release(), tag_name: "v0.3.0-evil" }],
  ["an out-of-range version", { ...release(), tag_name: "v999999.0.0" }],
  ["a release without the installable ZIP", { ...release(), assets: [] }],
  ["a ZIP on another host", { ...release(), assets: [{ ...release().assets[0], browser_download_url: "https://evil.test/install.zip" }] }],
  ["an asset not uploaded yet", { ...release(), assets: [{ ...release().assets[0], state: "new" }] }],
])("refuses %s rather than advertising an unsafe or unavailable update", async (_name, data) => {
  await expect(checkGitHubRelease("0.2.0", respond(data))).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
});

it("distinguishes no public release from being up to date", async () => {
  expect(await checkGitHubRelease("0.2.0", respond({ message: "Not Found" }, 404))).toEqual({ state: "unpublished" });
});
it.each([403, 429, 500])("does not claim up to date when GitHub returns HTTP %s", async (status) => {
  await expect(checkGitHubRelease("0.2.0", respond({}, status))).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
});
it("reports malformed JSON and network failures as failed checks", async () => {
  await expect(checkGitHubRelease("0.2.0", (async () => new Response("not JSON")) as typeof fetch)).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
  await expect(checkGitHubRelease("0.2.0", (async () => { throw Error("offline"); }) as typeof fetch)).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
});
it("aborts a stalled fetch so the UI can leave its pending state", async () => {
  vi.useFakeTimers();
  const fetcher = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const result = checkGitHubRelease("0.2.0", fetcher);
  const rejected = expect(result).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
});

it.each(["0.2", "0.2.0-dev", "v0.2.0", "01.2.0", "0.2.65536", ""])(
  "fails the check for installed version %j instead of falling back to a guess",
  async (installed) => {
    let requests = 0;
    const fetcher = (async () => { requests++; return new Response(JSON.stringify(release())); }) as typeof fetch;
    await expect(checkGitHubRelease(installed, fetcher)).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
    expect(requests).toBe(0);
  },
);

it("accepts a tag without the v prefix and builds URLs from that exact tag", async () => {
  const name = "chudin-note-youtube-0.3.0.zip";
  const data = { ...release(), tag_name: "0.3.0", assets: [{ name, state: "uploaded", browser_download_url: `${repo}/releases/download/0.3.0/${name}` }] };
  expect(await checkGitHubRelease("0.2.0", respond(data))).toEqual({
    state: "available", latestVersion: "0.3.0", releaseUrl: `${repo}/releases/tag/0.3.0`,
  });
});

it.each([
  ["a leading-zero tag", "v0.03.0"],
  ["a tag with path characters", "v0.3.0/../../x"],
  ["a tag with a fourth component", "v0.3.0.1"],
])("refuses %s before building any URL from it", async (_name, tag) => {
  await expect(checkGitHubRelease("0.2.0", respond({ ...release(), tag_name: tag }))).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
});

it("requires the ZIP URL to match the tag exactly, not just the host", async () => {
  const name = "chudin-note-youtube-0.3.0.zip";
  const data = { ...release(), assets: [{ name, state: "uploaded", browser_download_url: `${repo}/releases/download/v0.2.0/${name}` }] };
  await expect(checkGitHubRelease("0.2.0", respond(data))).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
});

it("rejects non-object and asset-less JSON bodies", async () => {
  for (const body of [null, [], "text", { ...release(), assets: undefined }]) {
    await expect(checkGitHubRelease("0.2.0", respond(body))).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
  }
});

it("sends one credential-free request to the fixed public endpoint", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const fetcher = (async (input, init) => { calls.push([input, init]); return new Response(JSON.stringify(release())); }) as typeof fetch;
  await checkGitHubRelease("0.2.0", fetcher);
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("https://api.github.com/repos/Chudien-2923/chudin-note-ytb-extension/releases/latest");
  expect(calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error" });
  expect(calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});

it("times out a response body that never finishes even when the fetch itself resolved", async () => {
  vi.useFakeTimers();
  const fetcher = (async (_input, init) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
  }))) as typeof fetch;
  const result = checkGitHubRelease("0.2.0", fetcher);
  const rejected = expect(result).rejects.toMatchObject({ code: "RELEASE_CHECK_FAILED" });
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
});
