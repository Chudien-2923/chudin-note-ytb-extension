export type ShortcutKey = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "ctrlKey"
  | "altKey"
  | "metaKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
  | "keyCode"
>;

export function shouldOpenPanelShortcut(
  event: ShortcutKey,
  path: EventTarget[],
): boolean {
  if (
    event.key.toLowerCase() !== "n" ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229
  )
    return false;
  // composedPath includes editable nodes inside open shadow roots, unlike event.target alone.
  return !path.some((target) => {
    if (
      !("nodeType" in target) ||
      target.nodeType !== 1 ||
      !("closest" in target) ||
      typeof target.closest !== "function"
    )
      return false;
    return (
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"]',
      ) !== null
    );
  });
}

export function shouldStartQuickNote(
  event: ShortcutKey,
  path: EventTarget[],
): boolean {
  if (
    event.code !== "KeyN" ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229
  )
    return false;
  return shouldOpenPanelShortcut({ ...event, key: "n", altKey: false }, path);
}

/** Close is deliberate and safe inside text fields; composition must finish first. */
export function shouldClosePanelShortcut(event: ShortcutKey): boolean {
  return (
    event.code === "KeyN" &&
    event.altKey &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}
