import "../ui/shared.css";
import { createClient } from "../ui/client";
import { mountNotebook } from "./controller";
import { mountReleaseCheck } from "../ui/release-check";
const root = document.querySelector<HTMLElement>("#app")!;
const client = createClient();
const notebook = mountNotebook(root, client);
const release = mountReleaseCheck(root, client, chrome.runtime.getManifest().version);
window.addEventListener("pagehide", () => {
  release.dispose();
  notebook.dispose();
}, { once: true });
