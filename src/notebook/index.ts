import "../ui/shared.css";
import { createClient } from "../ui/client";
import { mountNotebook } from "./controller";
const notebook = mountNotebook(
  document.querySelector<HTMLElement>("#app")!,
  createClient(),
);
window.addEventListener("pagehide", () => notebook.dispose(), { once: true });
