import { element, button } from "../ui/shared";
export interface NotebookView {
  selector: HTMLSelectElement;
  create: HTMLButtonElement;
  rename: HTMLButtonElement;
  videos: HTMLElement;
  query: HTMLInputElement;
  summary: HTMLElement;
  reading: HTMLElement;
  status: HTMLElement;
  recovery: HTMLElement;
  editor: HTMLElement;
  editorTitle: HTMLElement;
}
export function createNotebookView(root: HTMLElement): NotebookView {
  const header = element("header", "reader-header");
  const intro = element("div");
  intro.append(
    element("h1", "", "Cuốn sổ"),
    element(
      "small",
      "",
      "Chudin Note for YouTube · Ghi lại điều bạn hiểu, quay lại đoạn cần nhớ.",
    ),
  );
  const privacy = element(
    "small",
    "",
    "Chỉ lưu trong Chrome profile này. Chưa có backup; không gỡ extension để cập nhật.",
  );
  header.append(intro, privacy);
  const layout = element("div", "reader-layout");
  const nav = element("nav", "reader-nav");
  nav.setAttribute("aria-label", "Cuốn sổ và video");
  const label = element("label", "", "Cuốn sổ của bạn");
  const selector = element("select");
  selector.setAttribute("aria-label", "Chọn cuốn sổ");
  label.append(selector);
  const controls = element("div", "actions");
  const create = button("Tạo sổ", () => {});
  const rename = button("Đổi tên", () => {});
  controls.append(create, rename);
  const videos = element("div", "video-nav");
  nav.append(label, controls, element("h2", "", "Video"), videos);
  const main = element("section", "reader-main");
  const search = element("label", "search", "Tìm trong nội dung ghi chú");
  const query = element("input");
  query.type = "search";
  query.placeholder = "Tìm từ hoặc chủ đề trong sổ này";
  search.append(query);
  const status = element("p", "status");
  status.setAttribute("aria-live", "polite");
  const summary = element("p", "reading-summary");
  const reading = element("section");
  reading.setAttribute("aria-label", "Nội dung cuốn sổ");
  const recovery = element("section", "recovery");
  const editorTitle = element("h2");
  const editor = element("section", "reader-editor");
  main.append(search, status, summary, reading, recovery, editorTitle, editor);
  layout.append(nav, main);
  root.append(header, layout);
  return {
    selector,
    create,
    rename,
    videos,
    query,
    summary,
    reading,
    status,
    recovery,
    editor,
    editorTitle,
  };
}
