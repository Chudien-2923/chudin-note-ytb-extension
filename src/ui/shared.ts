import { formatTimestamp } from "../domain/identity";
import { asAppError, type Note } from "../domain/types";
export interface Mounted {
  dispose(): void;
}
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
export function button(
  text: string,
  action: () => void,
  className = "",
): HTMLButtonElement {
  const el = element("button", className, text);
  el.type = "button";
  el.addEventListener("click", action);
  return el;
}
export function setStatus(
  el: HTMLElement,
  text: string,
  kind: "info" | "error" = "info",
): void {
  if (el.textContent !== text) el.textContent = text;
  el.dataset.kind = kind;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
}
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = element("dialog");
    const form = element("form");
    form.method = "dialog";
    const heading = element("h2", "", "Xác nhận");
    const body = element("p", "", message);
    const controls = element("div", "actions");
    const cancel = button("Quay lại", () => dialog.close("cancel"));
    const confirm = button("Đồng ý", () => dialog.close("confirm"), "primary");
    controls.append(cancel, confirm);
    form.append(heading, body, controls);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        const accepted = dialog.returnValue === "confirm";
        dialog.remove();
        resolve(accepted);
      },
      { once: true },
    );
    dialog.showModal();
    cancel.focus();
  });
}
export function askNotebookName(
  title: string,
  initial = "",
): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = element("dialog");
    const form = element("form");
    form.method = "dialog";
    const heading = element("h2", "", title);
    const label = element("label", "", "Tên cuốn sổ");
    const input = element("input");
    input.type = "text";
    input.required = true;
    input.maxLength = 120;
    input.value = initial;
    label.append(input);
    const controls = element("div", "actions");
    const cancel = button("Hủy", () => dialog.close("cancel"));
    const submit = element("button", "primary", "Lưu tên");
    submit.type = "submit";
    controls.append(cancel, submit);
    form.append(heading, label, controls);
    dialog.append(form);
    document.body.append(dialog);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (input.value.trim()) dialog.close("save");
    });
    dialog.addEventListener(
      "close",
      () => {
        const result =
          dialog.returnValue === "save" ? input.value.trim() : null;
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    dialog.showModal();
    input.focus();
    input.select();
  });
}
export async function action(
  status: HTMLElement,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    setStatus(status, asAppError(error).message, "error");
  }
}
export interface NoteActions {
  seek(note: Note): void;
  edit(note: Note): void;
  delete(note: Note): void;
}
export function noteRow(note: Note, actions: NoteActions): HTMLElement {
  const article = element("article", "note");
  article.dataset.noteId = note.id;
  const toolbar = element("div", "note-toolbar");
  const stamp = button(
    formatTimestamp(note.timestampSeconds),
    () => actions.seek(note),
    "timestamp",
  );
  stamp.setAttribute(
    "aria-label",
    `Quay lại ${formatTimestamp(note.timestampSeconds)}`,
  );
  toolbar.append(
    stamp,
    button("Sửa", () => actions.edit(note), "quiet"),
    button("Xóa", () => actions.delete(note), "quiet"),
  );
  article.append(toolbar, element("p", "note-text", note.text));
  return article;
}
export const statusLabels = {
  ready: "",
  unsupported:
    "Mở video thường trên www.youtube.com để ghi chú. Bạn vẫn có thể đọc Cuốn sổ.",
  loading: "Đang chờ player sẵn sàng…",
  ad: "Đang phát quảng cáo nên chưa lấy timestamp mới. Khi video chính trở lại, ô ghi chú và nút “Ghi chú mới” sẽ tự bật nếu đã chọn sổ.",
  live: "Chưa hỗ trợ ghi/tua video đang phát trực tiếp.",
  unavailable: "Video không khả dụng. Ghi chú đã lưu vẫn đọc được.",
  "reload-required":
    "Hãy tải lại tab YouTube sau khi cài hoặc cập nhật extension.",
};
