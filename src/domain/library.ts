import {
  fail,
  MAX_NOTE_LENGTH,
  type NotebookSnapshot,
  type Note,
} from "./types";
export function validateNotebookName(name: string): string {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120)
    fail("INVALID_INPUT", "Tên cuốn sổ cần từ 1 đến 120 ký tự.");
  return name.trim();
}
export function validateNoteText(text: string): string {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_NOTE_LENGTH)
    fail("INVALID_INPUT", "Ghi chú cần có nội dung, tối đa 50.000 ký tự.");
  return text;
}
export function compareNotes(a: Note, b: Note): number {
  return (
    a.timestampSeconds - b.timestampSeconds ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}
export function searchNotebook(
  snapshot: NotebookSnapshot,
  query: string,
  videoId?: string,
) {
  const needle = query.normalize("NFC").toLocaleLowerCase("vi");
  const groups = new Map<string, Note[]>();
  for (const note of snapshot.notes) {
    if (
      (!videoId || note.videoId === videoId) &&
      note.text.normalize("NFC").toLocaleLowerCase("vi").includes(needle)
    ) {
      const list = groups.get(note.videoId) ?? [];
      list.push(note);
      groups.set(note.videoId, list);
    }
  }
  return [...snapshot.videos]
    .sort(
      (a, b) =>
        a.addedAt.localeCompare(b.addedAt) ||
        a.videoId.localeCompare(b.videoId),
    )
    .filter(
      (v) =>
        (!videoId || v.videoId === videoId) &&
        (groups.has(v.videoId) || !needle),
    )
    .map((video) => ({
      video,
      notes: (groups.get(video.videoId) ?? []).sort(compareNotes),
    }));
}
