import "../ui/shared.css";
import { attachPanel, createClient } from "../ui/client";
import { mountPanel } from "./controller";
import { startPanelFrame } from "./frame";
const frame = startPanelFrame({
  window,
  root: document.querySelector<HTMLElement>("#app")!,
  attach: attachPanel,
  createClient,
  mount: mountPanel,
});
window.addEventListener("pagehide", () => frame.dispose(), { once: true });
