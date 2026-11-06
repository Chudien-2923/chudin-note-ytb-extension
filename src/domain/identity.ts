import { fail, type PlayerBinding, type PlayerSnapshot } from "./types";
export function validVideoId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
}
export function parseVideoId(url: URL): string | null {
  const id = url.searchParams.get("v");
  return url.origin === "https://www.youtube.com" &&
    url.pathname === "/watch" &&
    validVideoId(id)
    ? id
    : null;
}
export function watchUrl(videoId: string): string {
  if (!validVideoId(videoId)) fail("INVALID_INPUT", "Video không hợp lệ.");
  return `https://www.youtube.com/watch?v=${videoId}`;
}
export function sameBinding(a: PlayerBinding, b: PlayerBinding): boolean {
  return (
    a.windowId === b.windowId &&
    a.tabId === b.tabId &&
    a.documentId === b.documentId &&
    a.documentToken === b.documentToken &&
    a.generation === b.generation &&
    a.videoId === b.videoId
  );
}
export function validPosition(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0)
    fail("INVALID_INPUT", "Thời điểm video không hợp lệ.");
  return seconds;
}
export function formatTimestamp(seconds: number): string {
  const n = Math.floor(validPosition(seconds));
  const s = String(n % 60).padStart(2, "0");
  const m = Math.floor(n / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${s}`
    : `${String(m).padStart(2, "0")}:${s}`;
}
export function resolveSeekTarget(
  snapshot: PlayerSnapshot,
  seconds: number,
): number {
  validPosition(seconds);
  if (
    snapshot.status !== "ready" ||
    !Number.isFinite(snapshot.duration) ||
    snapshot.duration! <= 0
  )
    fail(
      "PLAYER_UNAVAILABLE",
      "Player chưa sẵn sàng hoặc không hỗ trợ tua đoạn này.",
    );
  const ranges = snapshot.seekable.filter(
    (r) =>
      Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start,
  );
  if (!ranges.length) fail("PLAYER_UNAVAILABLE", "Đoạn video chưa tải để tua.");
  const target = Math.min(seconds, snapshot.duration!);
  for (const r of ranges)
    if (target >= r.start && target <= r.end) return target;
  return ranges.reduce((best, r) => {
    const candidate = Math.max(r.start, Math.min(r.end, target));
    return Math.abs(candidate - target) < Math.abs(best - target)
      ? candidate
      : best;
  }, ranges[0].start);
}
