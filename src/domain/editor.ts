import { sameBinding } from "./identity";
import {
  AppError,
  type Draft,
  type Note,
  type PanelContext,
  type PlayerBinding,
  type PlayerSnapshot,
} from "./types";
export interface EditorState {
  binding: PlayerBinding | null;
  draft: Draft | null;
  localVersion: number;
  acknowledgedLocalVersion: number;
  saving: boolean;
  error: AppError | null;
}
export interface EditorSession {
  bind(context: PanelContext): void;
  start(snapshot: PlayerSnapshot, draft: Draft): void;
  startEdit(draft: Draft): void;
  changeText(text: string): void;
  settleDraft(input: {
    draftId: string;
    localVersion: number;
    draft?: Draft;
    error?: AppError;
  }): void;
  beginSave(): Draft | null;
  settleSave(input: {
    draftId: string;
    draftRevision: number;
    binding: PlayerBinding | null;
    note?: Note;
    error?: AppError;
  }): void;
  clear(): void;
  snapshot(): EditorState;
}
export function createEditorSession(): EditorSession {
  let state: EditorState = {
    binding: null,
    draft: null,
    localVersion: 0,
    acknowledgedLocalVersion: 0,
    saving: false,
    error: null,
  };
  const session: EditorSession = {
    bind(context) {
      if (state.draft && state.draft.videoId !== context.videoId)
        session.clear();
      if (!state.draft) state.binding = context.binding;
    },
    start(snapshot, draft) {
      state = {
        binding: snapshot.binding,
        draft: { ...draft },
        localVersion: 0,
        acknowledgedLocalVersion: 0,
        saving: false,
        error: null,
      };
    },
    startEdit(draft) {
      state = {
        binding: null,
        draft: { ...draft },
        localVersion: 0,
        acknowledgedLocalVersion: 0,
        saving: false,
        error: null,
      };
    },
    changeText(text) {
      if (state.draft && !state.saving) {
        state.draft.text = text;
        state.localVersion++;
      }
    },
    settleDraft(input) {
      if (!state.draft || state.draft.id !== input.draftId) return;
      if (input.error) {
        state.error = input.error;
        return;
      }
      if (!input.draft || input.draft.revision < state.draft.revision) return;
      state.draft = { ...input.draft, text: state.draft.text };
      state.acknowledgedLocalVersion = Math.max(
        state.acknowledgedLocalVersion,
        input.localVersion,
      );
      state.error = null;
    },
    beginSave() {
      if (
        !state.draft ||
        state.saving ||
        state.localVersion !== state.acknowledgedLocalVersion ||
        !state.draft.text.trim()
      )
        return null;
      state.saving = true;
      state.error = null;
      return { ...state.draft };
    },
    settleSave(input) {
      if (
        !state.draft ||
        state.draft.id !== input.draftId ||
        state.draft.revision !== input.draftRevision ||
        (state.binding === null
          ? input.binding !== null
          : !input.binding || !sameBinding(state.binding, input.binding))
      )
        return;
      state.saving = false;
      if (input.error) state.error = input.error;
      else if (input.note) session.clear();
    },
    clear() {
      state = {
        binding: state.binding,
        draft: null,
        localVersion: 0,
        acknowledgedLocalVersion: 0,
        saving: false,
        error: null,
      };
    },
    snapshot() {
      return { ...state, draft: state.draft ? { ...state.draft } : null };
    },
  };
  return session;
}
