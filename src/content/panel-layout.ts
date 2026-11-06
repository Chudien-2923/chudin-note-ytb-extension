const SPLIT_ATTRIBUTE = "data-chudin-note-split";
export interface PanelLayout {
  /** Apply temporary page/player geometry and return the panel's actual width. */
  show(): number;
  hide(): void;
  dispose(): void;
}
interface MarginReservation {
  previous: string;
  priority: string;
  applied: string;
}
/** Owns only extension styling; media, iframe and existing player layout are never moved. */
export function createPanelLayout(
  doc: Document,
  preferredWidth: number,
): PanelLayout {
  const win = doc.defaultView!;
  const marker = crypto.randomUUID();
  const sheet = doc.createElement("style");
  let target: HTMLElement | null = null;
  let previousMarker: string | null = null;
  let geometry = "";
  let margin: MarginReservation | undefined;
  let disposed = false;
  function restoreMargin() {
    if (!margin) return;
    const style = doc.documentElement.style;
    if (
      style.getPropertyValue("margin-right") === margin.applied &&
      style.getPropertyPriority("margin-right") === "important"
    ) {
      if (margin.previous)
        style.setProperty("margin-right", margin.previous, margin.priority);
      else style.removeProperty("margin-right");
    }
    margin = undefined;
  }
  function reserveMargin(width: number) {
    const style = doc.documentElement.style;
    if (
      !margin ||
      style.getPropertyValue("margin-right") !== margin.applied ||
      style.getPropertyPriority("margin-right") !== "important"
    ) {
      margin = {
        previous: style.getPropertyValue("margin-right"),
        priority: style.getPropertyPriority("margin-right"),
        applied: "",
      };
    }
    const value = `${width}px`;
    if (margin.applied !== value) {
      margin.applied = value;
      style.setProperty("margin-right", value, "important");
    }
  }
  function restorePlayer() {
    if (target?.getAttribute(SPLIT_ATTRIBUTE) === marker) {
      if (previousMarker === null) target.removeAttribute(SPLIT_ATTRIBUTE);
      else target.setAttribute(SPLIT_ATTRIBUTE, previousMarker);
    }
    target = null;
    previousMarker = null;
    geometry = "";
    sheet.remove();
  }
  function applyPlayer(
    player: HTMLElement,
    width: number,
    height: number,
    panelWidth: number,
  ) {
    if (target !== player) {
      restorePlayer();
      target = player;
      previousMarker = player.getAttribute(SPLIT_ATTRIBUTE);
      player.setAttribute(SPLIT_ATTRIBUTE, marker);
    }
    const next = `${width}:${height}:${panelWidth}`;
    if (geometry !== next) {
      geometry = next;
      const scope = `#movie_player[${SPLIT_ATTRIBUTE}="${marker}"]`;
      // The :fullscreen root stays viewport-sized (UA !important rules).
      // Resize the media and its companion layers, not that root or its aspect ratio.
      sheet.textContent = `
${scope} .html5-video-container { width:${width}px!important; height:${height}px!important; left:0!important; top:0!important; }
${scope} video { width:${width}px!important; height:${height}px!important; max-width:none!important; max-height:none!important; left:0!important; top:0!important; object-fit:contain!important; }
${scope} .ytp-caption-window-container,
${scope} .ytp-chrome-top,
${scope} .ytp-gradient-top,
${scope} .ytp-gradient-bottom,
${scope} .ytp-pause-overlay,
${scope} .ytp-cued-thumbnail-overlay,
${scope} .ytp-endscreen-content { width:${width}px!important; max-width:${width}px!important; left:0!important; right:auto!important; box-sizing:border-box!important; }
${scope} .caption-window { max-width:${Math.max(0, width - 24)}px!important; box-sizing:border-box!important; }
${scope} .ytp-chrome-bottom { width:${Math.max(0, width - 24)}px!important; left:12px!important; right:auto!important; box-sizing:border-box!important; }
${scope} .ytp-settings-menu { right:${panelWidth + 12}px!important; left:auto!important; max-width:${Math.max(0, width - 24)}px!important; }
${scope}.ytp-big-mode .ytp-settings-menu { right:${panelWidth + 24}px!important; max-width:${Math.max(0, width - 48)}px!important; }
${scope} .ytp-settings-menu .ytp-panel { max-width:100%!important; }
`;
    }
    if (!sheet.isConnected) doc.documentElement.append(sheet);
  }
  const layout: PanelLayout = {
    show() {
      if (disposed) return 0;
      const player = doc.querySelector<HTMLElement>("#movie_player");
      const full = doc.fullscreenElement;
      const split =
        player &&
        (player.classList.contains("ytp-fullscreen") ||
          (full && (full === player || full.contains(player))));
      const panelWidth = Math.min(
        preferredWidth,
        split ? Math.floor(win.innerWidth / 2) : win.innerWidth,
      );
      if (split) {
        restoreMargin();
        applyPlayer(
          player,
          win.innerWidth - panelWidth,
          win.innerHeight,
          panelWidth,
        );
      } else {
        restorePlayer();
        reserveMargin(panelWidth);
      }
      return panelWidth;
    },
    hide() {
      restorePlayer();
      restoreMargin();
    },
    dispose() {
      if (disposed) return;
      layout.hide();
      disposed = true;
    },
  };
  return layout;
}
