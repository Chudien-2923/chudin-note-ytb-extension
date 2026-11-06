import type { Client } from "../ui/client";
import { sameBinding } from "../domain/identity";
import { asAppError, type PanelContext } from "../domain/types";
import {
  action,
  askNotebookName,
  button,
  confirmAction,
  element,
  noteRow,
  setStatus,
  statusLabels,
  type Mounted,
} from "../ui/shared";
import { createNoteEditor } from "../ui/note-editor";
import { createPanelView } from "./view";
export interface MountedPanel extends Mounted {
  refresh(windowId: number): void;
}
export function mountPanel(
  root: HTMLElement,
  client: Client,
  init: { windowId: number },
): MountedPanel {
  const view = createPanelView(root);
  let context: PanelContext | null = null;
  let windowId = init.windowId;
  let sequence = 0;
  let disposed = false;
  let notesKey = "";
  let recoveryKey = "";
  let selecting = false;
  let quickBusy = false;
  let quickAgain = false;
  let declinedQuick: string | undefined;
  let completedQuick: string | undefined;
  async function focusQuickNote() {
    if (disposed) return;
    if (quickBusy) {
      quickAgain = true;
      return;
    }
    quickBusy = true;
    try {
      const intent = await client.call("peekQuickNote", { windowId });
      if (!intent || intent.id === completedQuick || disposed) return;
      if (declinedQuick === intent.id && !editor.hasDraft()) return;
      if (
        !context?.binding ||
        !sameBinding(context.binding, intent.snapshot.binding)
      ) {
        if (context?.binding || context?.videoId !== intent.snapshot.videoId) {
          await client.call("ackQuickNote", { windowId, id: intent.id });
          setStatus(
            view.status,
            "Video đã thay đổi. Bấm Option + N tại video hiện tại.",
            "error",
          );
        }
        return;
      }
      if (!context.data.video) {
        setStatus(
          view.status,
          "Video đã pause. Chọn cuốn sổ để bắt đầu ghi chú nhanh.",
        );
        view.selector.focus();
        return;
      }
      if (!editor.hasDraft()) {
        if (context.data.drafts.length > 1) {
          setStatus(
            view.status,
            "Chọn bản nháp cần tiếp tục bên dưới; video vẫn pause.",
          );
          return;
        }
        if (context.data.drafts.length === 1) {
          await editor.restore(context.data.drafts[0]);
          if (!editor.hasDraft()) {
            declinedQuick = intent.id;
            setStatus(
              view.status,
              "Chọn bản nháp cần tiếp tục bên dưới; video vẫn pause.",
            );
            return;
          }
        }
      }
      await editor.beginQuickNote(intent.snapshot, intent.id);
      completedQuick = intent.id;
      await client.call("ackQuickNote", { windowId, id: intent.id });
    } catch (error) {
      if (!disposed) setStatus(view.status, asAppError(error).message, "error");
    } finally {
      quickBusy = false;
      if (quickAgain) {
        quickAgain = false;
        void focusQuickNote();
      }
    }
  }
  const editor = createNoteEditor(view.editor, client, (message) => {
    if (message) setStatus(view.status, message);
    void load();
  });
  async function load() {
    const request = ++sequence;
    try {
      const next = await client.call("getPanelContext", { windowId });
      if (disposed || request !== sequence) return;
      const previousStatus = context?.status;
      context = next;
      view.title.textContent =
        next.player?.title ||
        next.data.video?.title ||
        (next.videoId ?? "Ghi chú bên cạnh video");
      const optionKey = JSON.stringify(
        next.notebooks.map((n) => [n.id, n.name]),
      );
      if (view.selector.dataset.options !== optionKey) {
        view.selector.replaceChildren();
        const empty = element("option", "", "Chọn cuốn sổ");
        empty.value = "";
        view.selector.append(empty);
        for (const book of next.notebooks) {
          const option = element("option", "", book.name);
          option.value = book.id;
          view.selector.append(option);
        }
        view.selector.dataset.options = optionKey;
      }
      view.selector.value = next.data.video?.notebookId ?? "";
      view.selector.disabled = !next.videoId || selecting;
      if (statusLabels[next.status])
        setStatus(view.status, statusLabels[next.status]);
      else if (
        previousStatus &&
        previousStatus !== next.status &&
        view.status.textContent === statusLabels[previousStatus]
      )
        setStatus(view.status, "");
      view.count.textContent = `${next.data.notes.length} ghi chú đã lưu`;
      const nextNotesKey = JSON.stringify([
        next.videoId,
        next.status,
        !!next.data.video,
        next.data.notes.map((n) => [n.id, n.revision]),
      ]);
      if (notesKey !== nextNotesKey) {
        notesKey = nextNotesKey;
        view.notes.replaceChildren();
        if (!next.data.notes.length)
          view.notes.append(
            element(
              "p",
              "empty",
              next.status === "ad"
                ? "Chưa có ghi chú. Đợi video chính trở lại để bắt đầu; timestamp quảng cáo không được dùng."
                : next.data.video
                  ? "Chưa có ghi chú. Bấm “Ghi chú mới” hoặc chọn ô nhập để bắt đầu."
                  : "Chưa có ghi chú. Chọn cuốn sổ cho video rồi bắt đầu viết.",
            ),
          );
        for (const note of next.data.notes)
          view.notes.append(
            noteRow(note, {
              seek: (n) => {
                void action(view.status, async () => {
                  if (!context?.binding)
                    throw new Error("Player chưa sẵn sàng.");
                  await client.call("seekFromPanel", {
                    binding: context.binding,
                    timestampSeconds: n.timestampSeconds,
                  });
                });
              },
              edit: (n) => {
                void action(view.status, () => editor.edit(n));
              },
              delete: (n) => {
                void action(view.status, async () => {
                  if (
                    !(await confirmAction(
                      "Xóa ghi chú này? Không thể hoàn tác.",
                    ))
                  )
                    return;
                  await client.call("deleteNote", {
                    id: n.id,
                    expectedRevision: n.revision,
                  });
                  await load();
                });
              },
            }),
          );
      }
      editor.bind(next.data.video, next.binding, next.status === "ready");
      const key = JSON.stringify([
        next.videoId,
        next.data.drafts.map((d) => [d.id, d.revision]),
        editor.hasDraft(),
      ]);
      if (key !== recoveryKey) {
        recoveryKey = key;
        view.recovery.replaceChildren();
        if (next.data.drafts.length) {
          view.recovery.append(element("h2", "", "Nháp được giữ trên máy"));
          for (const draft of next.data.drafts) {
            const missing =
              draft.noteId &&
              !next.data.notes.some((n) => n.id === draft.noteId);
            const recovery = button(
              `${missing ? "Note gốc đã bị xóa — " : ""}${draft.text.slice(0, 100) || "Nháp chưa có chữ"} · ${new Date(draft.updatedAt).toLocaleString("vi")}`,
              () => {
                void action(view.status, () => editor.restore(draft));
              },
            );
            recovery.disabled = editor.hasDraft();
            view.recovery.append(recovery);
          }
        }
      }
      await focusQuickNote();
    } catch (error) {
      if (request === sequence && !disposed)
        setStatus(view.status, asAppError(error).message, "error");
    }
  }
  view.open.addEventListener("click", () => {
    void action(view.status, async () => {
      await client.call("openNotebook", {
        windowId,
        notebookId: context?.data.video?.notebookId,
      });
    });
  });
  view.create.addEventListener("click", () => {
    void action(view.status, async () => {
      const intended = context;
      const name = await askNotebookName("Tạo cuốn sổ");
      if (name === null) return;
      const book = await client.call("createNotebook", { name });
      if (intended?.videoId && !intended.data.video && intended.binding) {
        const actual = await client.call("getPanelContext", { windowId });
        if (
          actual.binding &&
          sameBinding(intended.binding, actual.binding) &&
          !actual.data.video
        )
          await client.call("assignVideo", {
            videoId: intended.videoId,
            title: actual.player?.title ?? intended.videoId,
            notebookId: book.id,
          });
      }
      await load();
    });
  });
  view.selector.addEventListener("change", () => {
    const target = view.selector.value;
    const old = context;
    view.selector.value = old?.data.video?.notebookId ?? "";
    if (!target || !old?.videoId) return;
    void action(view.status, async () => {
      if (old.data.video) {
        if (old.data.video.notebookId === target) return;
        if (editor.hasDraft()) {
          setStatus(
            view.status,
            "Hãy lưu hoặc hủy nháp trước khi chuyển sổ.",
            "error",
          );
          return;
        }
        if (
          !(await confirmAction(
            `Chuyển video cùng ${old.data.notes.length} ghi chú sang cuốn sổ đã chọn?`,
          ))
        )
          return;
      }
      selecting = true;
      view.selector.disabled = true;
      try {
        if (old.data.video)
          await client.call("moveVideo", {
            videoId: old.videoId!,
            notebookId: target,
            expectedRevision: old.data.video.revision,
          });
        else
          await client.call("assignVideo", {
            videoId: old.videoId!,
            notebookId: target,
            title: old.player?.title ?? old.videoId!,
          });
      } finally {
        selecting = false;
        await load();
      }
    });
  });
  const unsubscribe = client.subscribe(() => {
    void load();
  });
  const focus = () => {
    void load();
  };
  window.addEventListener("focus", focus);
  void load();
  return {
    refresh(nextWindowId) {
      if (disposed) return;
      windowId = nextWindowId;
      void load();
    },
    dispose() {
      disposed = true;
      sequence++;
      unsubscribe();
      window.removeEventListener("focus", focus);
      editor.dispose();
    },
  };
}
