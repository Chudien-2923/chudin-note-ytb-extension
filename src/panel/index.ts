import "../ui/shared.css";
import { attachPanel, createClient } from "../ui/client";
import { mountPanel } from "./controller";
import { startPanelFrame } from "./frame";
import { mountReleaseCheck } from "../ui/release-check";
const frame = startPanelFrame({
  window,
  root: document.querySelector<HTMLElement>("#app")!,
  attach: attachPanel,
  createClient,
  mount(root, client, init) {
    const panel = mountPanel(root, client, init);
    const release = mountReleaseCheck(root, client, chrome.runtime.getManifest().version);
    return {
      ...panel,
      dispose() {
        release.dispose();
        panel.dispose();
      },
    };
  },
});
window.addEventListener("pagehide", () => frame.dispose(), { once: true });
