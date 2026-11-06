import { element, button } from "../ui/shared";
export interface PanelView {
  title: HTMLElement;
  selector: HTMLSelectElement;
  create: HTMLButtonElement;
  open: HTMLButtonElement;
  status: HTMLElement;
  notes: HTMLElement;
  recovery: HTMLElement;
  editor: HTMLElement;
  count: HTMLElement;
}
export function createPanelView(root: HTMLElement): PanelView {
  const header = element("header");
  const toolbar = element("div", "toolbar");
  toolbar.append(element("h2", "", "Ghi chú YouTube"));
  const open = button("Cuốn sổ", () => {});
  toolbar.append(open);
  const title = element("h1", "", "Đang kết nối…");
  const choice = element("div", "notebook-choice");
  const label = element("label", "", "Cuốn sổ của video");
  const selector = element("select");
  selector.setAttribute("aria-label", "Cuốn sổ của video");
  label.append(selector);
  const create = button("Tạo sổ", () => {});
  choice.append(label, create);
  const status = element("p", "status");
  status.setAttribute("aria-live", "polite");
  header.append(toolbar, title, choice, status);
  const count = element("p", "muted");
  const notes = element("section", "panel-notes");
  notes.setAttribute("aria-label", "Ghi chú đã lưu");
  const recovery = element("section", "recovery");
  const editor = element("section", "panel-editor");
  root.append(header, count, notes, recovery, editor);
  return {
    title,
    selector,
    create,
    open,
    status,
    notes,
    recovery,
    editor,
    count,
  };
}
