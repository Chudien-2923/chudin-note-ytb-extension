import { AppError } from "../domain/types";
import { parseVideoId } from "../domain/identity";

export interface PanelToggleMessage {
  version: 1;
  op: "panel.toggle";
}
export interface ToolbarSurface {
  sendToTab(
    tabId: number,
    message: PanelToggleMessage,
    options: { frameId: 0 },
  ): Promise<unknown>;
  openNotebook(input: { windowId: number }): Promise<void>;
}
/**
 * Toolbar click: a supported YouTube watch tab toggles its in-page panel; any other surface,
 * or a tab whose content script is unavailable, opens the notebook in the same window.
 */
export async function handleToolbarClick(
  tab: chrome.tabs.Tab,
  surface: ToolbarSurface,
): Promise<void> {
  if (!Number.isSafeInteger(tab.windowId) || tab.windowId < 0)
    throw new AppError(
      "PLAYER_UNAVAILABLE",
      "Không xác định được cửa sổ Chrome để mở ghi chú.",
    );
  let watching: string | null = null;
  try {
    watching = parseVideoId(new URL(tab.url ?? "about:blank"));
  } catch {
    /* An unparsable URL is an unsupported surface. */
  }
  if (watching && Number.isSafeInteger(tab.id))
    try {
      await surface.sendToTab(
        tab.id!,
        { version: 1, op: "panel.toggle" },
        { frameId: 0 },
      );
      return;
    } catch {
      /* No content script in this page (loaded before install/update): open the notebook instead. */
    }
  await surface.openNotebook({ windowId: tab.windowId });
}
