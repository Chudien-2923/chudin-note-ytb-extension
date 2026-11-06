import { createEditorSession, type EditorSession } from "../domain/editor";
import {
  AppError,
  asAppError,
  type Draft,
  type Note,
  type PlayerBinding,
  type PlayerSnapshot,
  type VideoEntry,
} from "../domain/types";
import { formatTimestamp, sameBinding } from "../domain/identity";
import type { Client } from "./client";
import { button, confirmAction, element, setStatus } from "./shared";

interface Working {
  session: EditorSession;
  durable: Draft;
  queue: Promise<void>;
  committing: boolean;
  resumeBinding?: PlayerBinding;
  resumeRequestId?: string;
}
export interface NoteEditor {
  bind(
    video: VideoEntry | null,
    binding: PlayerBinding | null,
    canCapture: boolean,
  ): void;
  startNew(): Promise<void>;
  beginQuickNote(snapshot: PlayerSnapshot, requestId?: string): Promise<void>;
  edit(note: Note): Promise<void>;
  restore(draft: Draft): Promise<void>;
  hasDraft(): boolean;
  dispose(): void;
}
export function createNoteEditor(
  root: HTMLElement,
  client: Client,
  onSaved: (message?: string) => void,
): NoteEditor {
  const writerId = crypto.randomUUID();
  const slots = new Map<string, Working>();
  let video: VideoEntry | null = null;
  let binding: PlayerBinding | null = null;
  let canCapture = false;
  let current: Working | undefined;
  let renderedId = "";
  let disposed = false;
  let opening = false;
  let contextVersion = 0;
  let contextKey = "";
  let pendingQuick: PlayerSnapshot | undefined;
  const heading = element("h2", "", "Ghi chú");
  const time = element("span", "timestamp");
  const label = element("label", "editor-label", "Nội dung ghi chú");
  const textarea = element("textarea");
  textarea.rows = 5;
  textarea.placeholder = "Viết điều bạn hiểu bằng lời của mình…";
  const hint = element(
    "small",
    "muted",
    "Cmd/Ctrl + Enter để lưu; Enter xuống dòng.",
  );
  label.append(textarea);
  const status = element("p", "status");
  status.setAttribute("aria-live", "polite");
  const run = async (work: () => Promise<void>) => {
    const version = contextVersion;
    try {
      await work();
    } catch (error) {
      if (!disposed && version === contextVersion)
        setStatus(status, asAppError(error).message, "error");
    }
  };
  const fresh = button("Ghi chú mới", () => {
    void run(() => editor.startNew());
  });
  const save = button(
    "Lưu ghi chú",
    () => {
      void run(saveCurrent);
    },
    "primary",
  );
  const discard = button(
    "Hủy nháp",
    () => {
      void run(discardCurrent);
    },
    "quiet",
  );
  const recover = button("Cập nhật liên kết nháp", () => {
    void run(recoverCurrent);
  });
  const controls = element("div", "actions");
  controls.append(save, discard, recover);
  const top = element("div", "editor-heading");
  top.append(heading, time, fresh);
  root.append(top, label, controls, status, hint);

  function render() {
    if (disposed) return;
    const state = current?.session.snapshot();
    const draft = state?.draft;
    const key = draft?.id ?? "";
    if (renderedId !== key) {
      textarea.value = draft?.text ?? "";
      renderedId = key;
    }
    const overLimit = !!draft && draft.text.length > 50000;
    hint.textContent = current?.resumeBinding
      ? "Enter để lưu và phát tiếp video. Shift + Enter để xuống dòng."
      : "Cmd/Ctrl + Enter để lưu; Enter xuống dòng.";
    textarea.disabled = !draft && !(video && binding && canCapture);
    textarea.readOnly = !draft || !!state?.saving || !!current?.committing;
    save.disabled =
      !draft || !draft.text.trim() || overLimit || !!current?.committing;
    discard.disabled = !draft || !!current?.committing;
    fresh.disabled = !video || !binding || !canCapture || !!draft || opening;
    fresh.hidden = !!draft?.noteId || (!canCapture && !binding);
    recover.hidden =
      !draft ||
      !(
        state?.error?.code === "CONFLICT" ||
        state?.error?.code === "PLAYER_UNAVAILABLE" ||
        video?.revision !== draft.videoRevision
      );
    recover.disabled = !!current?.committing;
    heading.textContent = draft?.noteId ? "Sửa ghi chú" : "Ghi chú";
    time.textContent = draft ? formatTimestamp(draft.timestampSeconds) : "";
    if (overLimit)
      setStatus(
        status,
        "Nội dung vượt 50.000 ký tự. Chữ vẫn ở ô nhập nhưng chưa được giữ; hãy rút ngắn hoặc sao chép ra nơi an toàn.",
        "error",
      );
    else if (state?.error) setStatus(status, state.error.message, "error");
    else if (current?.committing) setStatus(status, "Đang lưu ghi chú…");
    else if (draft)
      setStatus(
        status,
        state!.localVersion === state!.acknowledgedLocalVersion
          ? "Nháp đã được giữ trên máy."
          : "Đang giữ nháp…",
      );
  }
  const writeText = (slot: Working, text: string, localVersion: number) => {
    slot.queue = slot.queue
      .catch(() => {})
      .then(async () => {
        const result = await client.call("putDraft", {
          draft: { ...slot.durable, text },
          expectedRevision: slot.durable.revision,
        });
        slot.durable = result;
        slot.session.settleDraft({
          draftId: result.id,
          localVersion,
          draft: result,
        });
      })
      .catch((error) => {
        slot.session.settleDraft({
          draftId: slot.durable.id,
          localVersion,
          error: asAppError(error),
        });
      })
      .finally(() => {
        if (current === slot) render();
      });
    return slot.queue;
  };
  textarea.addEventListener("input", () => {
    if (!current || current.committing) return;
    current.session.changeText(textarea.value);
    const state = current.session.snapshot();
    if (textarea.value.length <= 50000)
      void writeText(current, textarea.value, state.localVersion);
    render();
  });
  textarea.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey ||
        e.metaKey ||
        (!!current?.resumeBinding && !e.shiftKey && !e.altKey)) &&
      e.key === "Enter" &&
      !e.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      void run(saveCurrent);
    }
  });
  textarea.addEventListener("focus", () => {
    if (!current && !opening && video && binding && canCapture)
      void run(() => editor.startNew());
  });

  function finish(slot: Working, message: string) {
    const wasCurrent = current === slot;
    slot.session.clear();
    if (slots.get(slot.durable.videoId) === slot)
      slots.delete(slot.durable.videoId);
    if (current === slot) {
      current = undefined;
      renderedId = "";
      textarea.value = "";
      setStatus(status, message);
      // Enable the target before focusing: a disabled button cannot receive focus.
      render();
      if (!disposed) {
        if (!fresh.disabled && !fresh.hidden) fresh.focus();
        else {
          root.tabIndex = -1;
          root.focus();
        }
      }
    }
    onSaved(wasCurrent ? message : undefined);
  }
  async function saveCurrent() {
    const slot = current;
    if (!slot || slot.committing) return;
    const before = slot.session.snapshot();
    if (!before.draft?.text.trim())
      throw new AppError("INVALID_INPUT", "Hãy viết nội dung trước khi lưu.");
    if (before.draft.text.length > 50000)
      throw new AppError(
        "INVALID_INPUT",
        "Ghi chú vượt 50.000 ký tự. Hãy rút ngắn; nội dung vẫn ở ô nhập.",
      );
    slot.committing = true;
    render();
    try {
      await slot.queue;
      const state = slot.session.snapshot();
      if (state.draft && state.localVersion !== state.acknowledgedLocalVersion)
        await writeText(slot, state.draft.text, state.localVersion);
      const intent = slot.session.beginSave();
      if (!intent) {
        const error = slot.session.snapshot().error;
        if (error) throw error;
        return;
      }
      const expectedBinding = slot.session.snapshot().binding;
      try {
        const note = await client.call("commitDraft", { draft: intent });
        slot.session.settleSave({
          draftId: intent.id,
          draftRevision: intent.revision,
          binding: expectedBinding,
          note,
        });
        finish(slot, "Đã lưu ghi chú.");
        if (slot.resumeBinding) {
          try {
            await client.call("resumePlayer", {
              binding: slot.resumeBinding,
              quickRequestId: slot.resumeRequestId!,
            });
          } catch (error) {
            const message = `Ghi chú đã lưu. ${asAppError(error).message}`;
            if (video?.videoId === slot.durable.videoId) {
              setStatus(status, message, "error");
              onSaved(message);
            }
          }
        }
      } catch (error) {
        slot.session.settleSave({
          draftId: intent.id,
          draftRevision: intent.revision,
          binding: expectedBinding,
          error: asAppError(error),
        });
      }
    } finally {
      slot.committing = false;
      if (current === slot || !current) render();
    }
  }
  async function discardCurrent() {
    const slot = current;
    if (!slot || slot.committing) return;
    if (
      slot.session.snapshot().draft?.text &&
      !(await confirmAction(
        "Hủy nội dung nháp này? Ghi chú đã lưu không bị xóa.",
      ))
    )
      return;
    slot.committing = true;
    render();
    try {
      await slot.queue;
      try {
        await client.call("discardDraft", {
          id: slot.durable.id,
          writerId: slot.durable.writerId,
          expectedRevision: slot.durable.revision,
        });
      } catch (error) {
        const e = asAppError(error);
        if (e.code !== "CONFLICT" && e.code !== "NOT_FOUND") throw error;
        if (
          !(await confirmAction(
            "Nháp trên máy đã thay đổi hoặc không còn. Hãy sao chép chữ cần giữ trước. Bỏ riêng bản đang mở, không xóa dữ liệu của nơi khác?",
          ))
        )
          return;
      }
      finish(slot, "Đã đóng bản nháp đang mở.");
    } finally {
      slot.committing = false;
      render();
    }
  }
  async function recoverCurrent() {
    const slot = current;
    if (!slot || slot.committing) return;
    slot.committing = true;
    render();
    try {
      await slot.queue;
      const state = slot.session.snapshot();
      if (!state.draft) return;
      const data = await client.call("readVideo", {
        videoId: slot.durable.videoId,
      });
      let stored = data.drafts.find(
        (d) => d.id === slot.durable.id && d.writerId === slot.durable.writerId,
      );
      if (!stored) {
        const saved = data.notes.find(
          (n) => n.id === (state.draft!.noteId ?? state.draft!.id),
        );
        const expected = state.draft.noteId
          ? state.draft.expectedNoteRevision! + 1
          : 1;
        if (
          saved &&
          saved.text === state.draft.text &&
          saved.timestampSeconds === state.draft.timestampSeconds &&
          saved.revision === expected
        ) {
          finish(slot, "Đã xác nhận ghi chú được lưu trước khi mất kết nối.");
          return;
        }
        throw new AppError(
          "CONFLICT",
          "Nháp gốc đã thay đổi hoặc không còn. Không ghi đè note mới. Hãy sao chép nội dung cần giữ rồi Hủy nháp để đóng riêng bản đang mở.",
        );
      }
      if (!data.video)
        throw new AppError(
          "NOT_FOUND",
          "Không tìm thấy video của nháp. Hãy sao chép nội dung ra nơi an toàn.",
        );
      if (stored.videoRevision !== data.video.revision) {
        if (
          !(await confirmAction(
            "Video đã được chuyển sổ. Giữ nguyên chữ đang nhập và tiếp tục nháp trong sổ hiện tại?",
          ))
        )
          return;
        stored = await client.call("rebindDraft", {
          id: stored.id,
          writerId: stored.writerId,
          expectedDraftRevision: stored.revision,
          expectedCurrentVideoRevision: data.video.revision,
        });
      }
      slot.durable = stored;
      slot.session.settleDraft({
        draftId: stored.id,
        localVersion: state.acknowledgedLocalVersion,
        draft: stored,
      });
      await writeText(slot, state.draft.text, state.localVersion);
      onSaved();
    } finally {
      slot.committing = false;
      if (current === slot) render();
    }
  }
  const adopt = (draft: Draft, capture?: PlayerSnapshot) => {
    const session = createEditorSession();
    if (capture) session.start(capture, draft);
    else session.startEdit(draft);
    const slot: Working = {
      session,
      durable: draft,
      queue: Promise.resolve(),
      committing: false,
    };
    // A committed draft stays recoverable in its own video even if the page changed during the write.
    slots.set(draft.videoId, slot);
    if (video?.videoId === draft.videoId && !disposed) {
      current = slot;
      render();
      textarea.focus();
    }
  };
  const beginOpening = () => {
    if (opening || current?.session.snapshot().draft)
      throw new AppError("CONFLICT", "Hãy lưu hoặc hủy nháp đang mở trước.");
    opening = true;
    const version = contextVersion;
    render();
    return () => {
      if (disposed || version !== contextVersion)
        throw new AppError(
          "STALE_CONTEXT",
          "Video hoặc sổ đã thay đổi. Hãy thử lại từ trang hiện tại.",
        );
    };
  };
  const editor: NoteEditor = {
    bind(next, nextBinding, captureReady) {
      const key = JSON.stringify([
        next?.videoId,
        next?.revision,
        nextBinding,
        captureReady,
      ]);
      if (key !== contextKey) {
        contextVersion++;
        contextKey = key;
      }
      video = next;
      binding = nextBinding;
      canCapture = captureReady;
      const selected = video ? slots.get(video.videoId) : undefined;
      if (
        selected?.resumeBinding &&
        nextBinding &&
        !sameBinding(selected.resumeBinding, nextBinding)
      )
        delete selected.resumeBinding;
      if (current !== selected) {
        current = selected;
        renderedId = "\u0000";
        setStatus(status, "");
      }
      render();
    },
    async beginQuickNote(snapshot, requestId = crypto.randomUUID()) {
      if (
        !video ||
        !binding ||
        !sameBinding(binding, snapshot.binding) ||
        snapshot.currentTime === null
      )
        throw new AppError(
          "STALE_CONTEXT",
          "Video đã thay đổi trước khi focus ghi chú.",
        );
      if (current?.committing || opening)
        throw new AppError(
          "CONFLICT",
          "Đang hoàn tất thao tác trước. Hãy thử Option + N lại.",
        );
      if (current?.session.snapshot().draft) {
        current.resumeBinding = snapshot.binding;
        current.resumeRequestId = requestId;
        render();
        textarea.focus();
        return;
      }
      pendingQuick = snapshot;
      try {
        await editor.startNew();
        if (
          current?.durable.videoId === snapshot.videoId &&
          binding &&
          sameBinding(binding, snapshot.binding)
        ) {
          current.resumeBinding = snapshot.binding;
          current.resumeRequestId = requestId;
          render();
          textarea.focus();
        }
      } finally {
        pendingQuick = undefined;
      }
    },
    async startNew() {
      const check = beginOpening();
      try {
        if (!video || !binding || !canCapture)
          throw new AppError(
            "PLAYER_UNAVAILABLE",
            "Chọn sổ và chờ player sẵn sàng.",
          );
        const target = video;
        const snapshot = await client.call("capturePlayer", { binding });
        check();
        if (snapshot.status !== "ready" || snapshot.currentTime === null)
          throw new AppError(
            "PLAYER_UNAVAILABLE",
            "Player chưa sẵn sàng để lấy timestamp.",
          );
        const draft = await client.call("putDraft", {
          draft: {
            id: crypto.randomUUID(),
            writerId,
            videoId: target.videoId,
            videoRevision: target.revision,
            timestampSeconds:
              pendingQuick?.currentTime !== undefined &&
              pendingQuick.currentTime !== null
                ? Math.max(0, pendingQuick.currentTime - 20)
                : snapshot.currentTime,
            text: "",
          },
          expectedRevision: null,
        });
        adopt(draft, snapshot);
        onSaved();
      } finally {
        opening = false;
        render();
        onSaved();
      }
    },
    async edit(note) {
      const check = beginOpening();
      try {
        if (!video || video.videoId !== note.videoId)
          throw new AppError("STALE_CONTEXT", "Chọn đúng video trước khi sửa.");
        check();
        const draft = await client.call("putDraft", {
          draft: {
            id: crypto.randomUUID(),
            writerId,
            videoId: note.videoId,
            videoRevision: video.revision,
            timestampSeconds: note.timestampSeconds,
            text: note.text,
            noteId: note.id,
            expectedNoteRevision: note.revision,
          },
          expectedRevision: null,
        });
        adopt(draft);
        onSaved();
      } finally {
        opening = false;
        render();
        onSaved();
      }
    },
    async restore(source) {
      const check = beginOpening();
      try {
        if (!video || source.videoId !== video.videoId)
          throw new AppError(
            "STALE_CONTEXT",
            "Nháp không thuộc video đang chọn.",
          );
        const target = video;
        let draft = source;
        if (draft.videoRevision !== target.revision) {
          if (
            !(await confirmAction(
              "Video đã được chuyển sổ. Tiếp tục nháp trong sổ hiện tại?",
            ))
          )
            return;
          check();
          draft = await client.call("rebindDraft", {
            id: draft.id,
            writerId: draft.writerId,
            expectedDraftRevision: draft.revision,
            expectedCurrentVideoRevision: target.revision,
          });
        }
        const restored = await client.call("restoreDraft", {
          sourceId: draft.id,
          expectedSourceRevision: draft.revision,
          writerId,
          newDraftId: crypto.randomUUID(),
        });
        adopt(restored);
        onSaved();
      } finally {
        opening = false;
        render();
        onSaved();
      }
    },
    hasDraft: () => opening || !!current?.session.snapshot().draft,
    dispose() {
      disposed = true;
      contextVersion++;
    },
  };
  render();
  return editor;
}
