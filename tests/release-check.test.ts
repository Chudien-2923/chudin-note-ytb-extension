import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { checkGitHubRelease } from "../src/background/releases";
import { mountReleaseCheck } from "../src/ui/release-check";
import type { Client } from "../src/ui/client";

const repo = "https://github.com/Chudien-2923/chudin-note-ytb-extension";
let dom: JSDOM;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); });
function setup(fetcher: typeof fetch) {
  dom = new JSDOM('<main id="app"></main>', { url: "https://extension.test/" });
  vi.stubGlobal("document", dom.window.document);
  const root = document.querySelector<HTMLElement>("#app")!;
  let pending: Promise<unknown> | undefined;
  const client: Client = {
    async call(op) {
      if (op !== "checkRelease") throw Error(`Unexpected command: ${op}`);
      pending = checkGitHubRelease("0.2.0", fetcher);
      return await pending as never;
    },
    subscribe() { return () => {}; },
  };
  const mounted = mountReleaseCheck(root, client, "0.2.0");
  const button = root.querySelector<HTMLButtonElement>("button")!;
  return { root, mounted, button, settled: () => pending };
}
function response(version: string) {
  const name = `chudin-note-youtube-${version}.zip`;
  return new Response(JSON.stringify({
    tag_name: `v${version}`, draft: false, prerelease: false,
    assets: [{ name, state: "uploaded", browser_download_url: `${repo}/releases/download/v${version}/${name}` }],
  }));
}

it("does no automatic network work and allows only one in-flight manual check", async () => {
  let complete: (response: Response) => void = () => { throw Error("No pending request"); };
  let requests = 0;
  const fetcher = (() => {
    requests++;
    return new Promise<Response>((resolve) => { complete = resolve; });
  }) as typeof fetch;
  const { root, button } = setup(fetcher);
  expect(root.textContent).toContain("0.2.0");
  expect(requests).toBe(0);
  button.click(); button.click();
  expect(button.disabled).toBe(true);
  expect(requests).toBe(1);
  complete(response("0.3.0"));
  await vi.waitFor(() => expect(root.querySelector("a")?.href).toBe(`${repo}/releases/tag/v0.3.0`));
  expect(button.disabled).toBe(false);
  expect(root.querySelector("a")?.rel).toContain("noopener");
});

it("clears a stale download link on failure and allows a later successful check", async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests++;
    if (requests === 2) throw Error("offline");
    return response(requests === 1 ? "0.3.0" : "0.2.0");
  }) as typeof fetch;
  const { root, button } = setup(fetcher);
  button.click();
  await vi.waitFor(() => expect(root.querySelector("a")).not.toBeNull());
  button.click();
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).not.toBeNull());
  expect(root.querySelector("a")).toBeNull();
  expect(button.disabled).toBe(false);
  button.click();
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')).toBeNull());
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(root.querySelector("a")).toBeNull();
  expect(root.textContent).toContain("0.2.0");
});

it("does not leave an active control or render late results after disposal", async () => {
  let complete: (response: Response) => void = () => { throw Error("No pending request"); };
  let requests = 0;
  const fetcher = (() => {
    requests++;
    return new Promise<Response>((resolve) => { complete = resolve; });
  }) as typeof fetch;
  const { root, mounted, button, settled } = setup(fetcher);
  button.click(); mounted.dispose();
  complete(response("0.3.0"));
  await settled();
  await Promise.resolve();
  button.click();
  expect(requests).toBe(1);
  expect(root.querySelector("a")).toBeNull();
  expect(root.querySelector("button")).toBeNull();
});

it("reports installed-ahead and unpublished states without offering a link", async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests++;
    return requests === 1 ? response("0.1.0") : new Response("", { status: 404 });
  }) as typeof fetch;
  const { root, button } = setup(fetcher);
  button.click();
  await vi.waitFor(() => expect(root.querySelector('[role="status"]')?.textContent).toContain("0.1.0"));
  expect(root.querySelector("a")).toBeNull();
  button.click();
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(root.querySelector('[role="status"]')?.textContent).not.toContain("0.1.0");
  expect(root.querySelector("a")).toBeNull();
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

it("keeps a user draft and its keyboard focus untouched while checking", async () => {
  const fetcher = (async () => response("0.3.0")) as typeof fetch;
  const { root, button } = setup(fetcher);
  const draft = document.createElement("textarea");
  root.prepend(draft);
  draft.value = "ghi chú đang viết";
  draft.focus();
  button.click();
  await vi.waitFor(() => expect(root.querySelector("a")).not.toBeNull());
  expect(draft.value).toBe("ghi chú đang viết");
  expect(document.activeElement).toBe(draft);
  expect(root.querySelector("a")?.target).toBe("_blank");
});
