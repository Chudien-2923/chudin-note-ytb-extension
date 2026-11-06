import { searchNotebook } from "../domain/library";
import { watchUrl } from "../domain/identity";
import {
  AppError,
  asAppError,
  type Notebook,
  type NotebookSnapshot,
  type Note,
  type VideoEntry,
} from "../domain/types";
import type { Client } from "../ui/client";
import {
  action,
  askNotebookName,
  button,
  confirmAction,
  element,
  noteRow,
  setStatus,
  type Mounted,
} from "../ui/shared";
import { createNoteEditor } from "../ui/note-editor";
import { createNotebookView } from "./view";
export function mountNotebook(root: HTMLElement, client: Client): Mounted {
  const view = createNotebookView(root);
  let books: Notebook[] = [];
  let notebookId = new URL(location.href).searchParams.get("notebook");
  let videoId: string | null = null;
  let snapshot: NotebookSnapshot | null = null;
  let editingVideo: VideoEntry | null = null;
  let windowId: number | undefined;
  let sequence = 0;
  let recoverySequence = 0;
  let disposed = false;
  const editor = createNoteEditor(view.editor, client, (message) => {
    if (message) setStatus(view.status, message);
    void load();
  });
  view.editor.hidden = true;
  view.editorTitle.hidden = true;
  const edit = async (note: Note) => {
    if (editor.hasDraft())
      throw new AppError("CONFLICT", "Hãy lưu hoặc hủy nháp đang mở trước.");
    const video = snapshot?.videos.find((v) => v.videoId === note.videoId);
    if (!video) return;
    editingVideo = video;
    editor.bind(video, null, false);
    view.editor.hidden = false;
    view.editorTitle.hidden = false;
    view.editorTitle.textContent = `Sửa ghi chú · ${video.title}`;
    await editor.edit(note);
    view.editor.scrollIntoView?.({ block: "nearest" });
  };
  async function renderRecovery() {
    const request = ++recoverySequence;
    view.recovery.replaceChildren();
    if (!videoId || !snapshot) return;
    const chosen = videoId;
    try {
      const data = await client.call("readVideo", { videoId: chosen });
      if (disposed || request !== recoverySequence || videoId !== chosen)
        return;
      if (data.drafts.length)
        view.recovery.append(element("h2", "", "Nháp của video này"));
      for (const draft of data.drafts) {
        const missing =
          draft.noteId && !data.notes.some((n) => n.id === draft.noteId);
        const item = button(
          `${missing ? "Note gốc đã bị xóa — " : ""}${draft.text.slice(0, 120) || "Nháp chưa có chữ"}`,
          () => {
            void action(view.status, async () => {
              if (editor.hasDraft())
                throw new AppError(
                  "CONFLICT",
                  "Hãy lưu hoặc hủy nháp đang mở trước.",
                );
              editingVideo = data.video;
              editor.bind(data.video, null, false);
              view.editor.hidden = false;
              view.editorTitle.hidden = false;
              view.editorTitle.textContent = `Tiếp tục nháp · ${data.video?.title ?? chosen}`;
              await editor.restore(draft);
            });
          },
        );
        item.disabled = editor.hasDraft();
        view.recovery.append(item);
      }
    } catch (error) {
      if (request === recoverySequence)
        setStatus(view.status, asAppError(error).message, "error");
    }
  }
  function render() {
    if (!snapshot) {
      view.reading.replaceChildren(
        element(
          "p",
          "empty",
          "Tạo cuốn sổ, rồi mở video YouTube và chọn sổ trong side panel để bắt đầu.",
        ),
      );
      view.videos.replaceChildren();
      view.rename.disabled = true;
      view.query.disabled = true;
      view.summary.textContent = "";
      return;
    }
    view.rename.disabled = false;
    view.query.disabled = false;
    view.videos.replaceChildren();
    const all = button("Tất cả video", () => {
      videoId = null;
      render();
      void renderRecovery();
    });
    all.setAttribute("aria-current", String(videoId === null));
    view.videos.append(all);
    for (const video of [...snapshot.videos].sort(
      (a, b) =>
        a.addedAt.localeCompare(b.addedAt) ||
        a.videoId.localeCompare(b.videoId),
    )) {
      const count = snapshot.notes.filter(
        (n) => n.videoId === video.videoId,
      ).length;
      const item = button(`${video.title} · ${count}`, () => {
        videoId = video.videoId;
        render();
        void renderRecovery();
      });
      item.setAttribute("aria-current", String(videoId === video.videoId));
      item.title = video.videoId;
      view.videos.append(item);
    }
    const groups = searchNotebook(
      snapshot,
      view.query.value,
      videoId ?? undefined,
    );
    const count = groups.reduce((sum, g) => sum + g.notes.length, 0);
    view.summary.textContent = `${snapshot.notebook.name} · ${count} ghi chú${view.query.value ? " khớp tìm kiếm" : ""}`;
    view.reading.replaceChildren();
    if (!groups.length)
      view.reading.append(
        element(
          "p",
          "empty",
          view.query.value
            ? "Không có ghi chú khớp trong phạm vi đang chọn."
            : "Sổ này chưa có video. Chọn sổ cho một video trong side panel.",
        ),
      );
    for (const group of groups) {
      const section = element("section", "video-group");
      section.append(element("h2", "", group.video.title));
      const link = element("a", "", group.video.videoId);
      link.href = watchUrl(group.video.videoId);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      section.append(link);
      if (!group.notes.length)
        section.append(element("p", "empty", "Video này chưa có ghi chú."));
      for (const note of group.notes)
        section.append(
          noteRow(note, {
            seek: (n) => {
              void action(view.status, async () => {
                if (windowId === undefined)
                  throw new AppError(
                    "PLAYER_UNAVAILABLE",
                    "Không xác định được cửa sổ.",
                  );
                setStatus(view.status, "Đang mở đoạn ghi chú…");
                await client.call("seekFromNotebook", {
                  windowId,
                  videoId: n.videoId,
                  timestampSeconds: n.timestampSeconds,
                });
                setStatus(view.status, "Player đã xác nhận tới đoạn ghi chú.");
              });
            },
            edit: (n) => {
              void action(view.status, () => edit(n));
            },
            delete: (n) => {
              void action(view.status, async () => {
                if (
                  !(await confirmAction("Xóa ghi chú này? Không thể hoàn tác."))
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
      view.reading.append(section);
    }
  }
  async function load() {
    const request = ++sequence;
    try {
      if (windowId === undefined)
        windowId = (await chrome.windows.getCurrent()).id;
      const nextBooks = await client.call("listNotebooks", {});
      if (disposed || request !== sequence) return;
      books = nextBooks;
      if (notebookId && !books.some((b) => b.id === notebookId)) {
        setStatus(
          view.status,
          "Không tìm thấy cuốn sổ đã chọn. Hãy chọn sổ khác.",
          "error",
        );
        notebookId = null;
      }
      if (!notebookId) notebookId = books[0]?.id ?? null;
      const next = notebookId
        ? await client.call("readNotebook", { notebookId })
        : null;
      if (disposed || request !== sequence) return;
      snapshot = next;
      view.selector.replaceChildren();
      if (!books.length) {
        const option = element("option", "", "Chưa có cuốn sổ");
        option.value = "";
        view.selector.append(option);
      }
      for (const book of books) {
        const option = element("option", "", book.name);
        option.value = book.id;
        view.selector.append(option);
      }
      view.selector.value = notebookId ?? "";
      if (videoId && !next?.videos.some((v) => v.videoId === videoId))
        videoId = null;
      if (editingVideo) {
        const latest =
          next?.videos.find((v) => v.videoId === editingVideo!.videoId) ??
          (await client.call("readVideo", { videoId: editingVideo.videoId }))
            .video;
        if (disposed || request !== sequence) return;
        if (latest) editingVideo = latest;
        editor.bind(editingVideo, null, false);
        if (!editor.hasDraft()) {
          view.editor.hidden = true;
          view.editorTitle.hidden = true;
          editingVideo = null;
        }
      }
      render();
      await renderRecovery();
    } catch (error) {
      if (request === sequence && !disposed)
        setStatus(view.status, asAppError(error).message, "error");
    }
  }
  view.query.addEventListener("input", render);
  view.selector.addEventListener("change", () => {
    const target = view.selector.value;
    if (editor.hasDraft()) {
      view.selector.value = notebookId ?? "";
      setStatus(
        view.status,
        "Hãy lưu hoặc hủy nháp đang mở trước khi đổi sổ.",
        "error",
      );
      return;
    }
    notebookId = target || null;
    videoId = null;
    view.query.value = "";
    setStatus(view.status, "");
    history.replaceState(
      null,
      "",
      notebookId
        ? `?notebook=${encodeURIComponent(notebookId)}`
        : location.pathname,
    );
    void load();
  });
  view.create.addEventListener("click", () => {
    void action(view.status, async () => {
      if (editor.hasDraft())
        throw new AppError(
          "CONFLICT",
          "Hãy lưu hoặc hủy nháp trước khi tạo và chuyển sang sổ mới.",
        );
      const name = await askNotebookName("Tạo cuốn sổ");
      if (name === null) return;
      notebookId = (await client.call("createNotebook", { name })).id;
      videoId = null;
      view.query.value = "";
      await load();
    });
  });
  view.rename.addEventListener("click", () => {
    void action(view.status, async () => {
      const book = books.find((b) => b.id === notebookId);
      if (!book) return;
      const name = await askNotebookName("Đổi tên cuốn sổ", book.name);
      if (name === null) return;
      await client.call("renameNotebook", {
        id: book.id,
        name,
        expectedRevision: book.revision,
      });
      await load();
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
    dispose() {
      disposed = true;
      sequence++;
      recoverySequence++;
      unsubscribe();
      window.removeEventListener("focus", focus);
      editor.dispose();
    },
  };
}
