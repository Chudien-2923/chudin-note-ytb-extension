import {
  AppError,
  clock as defaultClock,
  fail,
  SEEK_TIMEOUT_MS,
  type Clock,
  type PanelContext,
  type PendingSeek,
  type PlayerBinding,
  type PlayerReport,
  type PlayerSnapshot,
} from "../domain/types";
import {
  parseVideoId,
  resolveSeekTarget,
  sameBinding,
  validPosition,
  watchUrl,
} from "../domain/identity";
import type { PendingSeekStore } from "../storage/pending-seeks";
import { record, validateReport } from "../shared/protocol";
export type PlayerContext = Pick<
  PanelContext,
  "windowId" | "tabId" | "videoId" | "binding" | "player" | "status"
>;
export interface TabCoordinator {
  getPlayerContext(input: { windowId: number }): Promise<PlayerContext>;
  capturePlayer(input: { binding: PlayerBinding }): Promise<PlayerSnapshot>;
  resumePlayer(input: { binding: PlayerBinding }): Promise<void>;
  seekFromPanel(input: {
    binding: PlayerBinding;
    timestampSeconds: number;
  }): Promise<void>;
  seekFromNotebook(input: {
    windowId: number;
    videoId: string;
    timestampSeconds: number;
  }): Promise<void>;
  openNotebook(input: { windowId: number; notebookId?: string }): Promise<void>;
  acceptReport(
    report: PlayerReport,
    sender: chrome.runtime.MessageSender,
  ): void;
  onTabRemoved(tabId: number): Promise<void>;
  reconcilePending(): Promise<void>;
}
export function createTabCoordinator(input: {
  chromeApi: Pick<typeof chrome, "tabs" | "windows">;
  pendingSeeks: PendingSeekStore;
  clock?: Clock;
  extensionId: string;
}): TabCoordinator {
  const api = input.chromeApi;
  const store = input.pendingSeeks;
  const clock = input.clock ?? defaultClock;
  const reports = new Map<number, PlayerSnapshot>();
  const inFlight = new Set<string>();
  const fromUrl = (url?: string) => {
    try {
      return parseVideoId(new URL(url ?? "about:blank"));
    } catch {
      return null;
    }
  };
  const chromeCall = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PLAYER_UNAVAILABLE",
        "Tab video không còn hoặc mất kết nối player. Hãy mở lại video rồi thử.",
      );
    }
  };
  const bounded = <T>(operation: Promise<T>, expiresAt: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const remaining = expiresAt - Date.parse(clock.now());
      const timer = setTimeout(
        () =>
          reject(
            new AppError(
              "SEEK_TIMEOUT",
              "Player chưa trả lời trong thời hạn 15 giây.",
            ),
          ),
        Math.max(0, remaining),
      );
      operation.then(
        (value) => {
          clearTimeout(timer);
          if (remaining <= 0)
            reject(new AppError("SEEK_TIMEOUT", "Yêu cầu tua đã hết hạn."));
          else resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  const captureTab = async (
    tab: chrome.tabs.Tab,
    expected?: PlayerBinding,
    expiresAt = Date.parse(clock.now()) + SEEK_TIMEOUT_MS,
  ): Promise<PlayerSnapshot> => {
    if (tab.id === undefined || !fromUrl(tab.url))
      fail("PLAYER_UNAVAILABLE", "Hãy mở video YouTube được hỗ trợ.");
    const requestId = clock.newId();
    let raw: unknown;
    try {
      raw = await bounded(
        chromeCall(() =>
          api.tabs.sendMessage(
            tab.id!,
            { version: 1, requestId, op: "player.capture", expected },
            expected ? { documentId: expected.documentId } : {},
          ),
        ),
        expiresAt,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "SEEK_TIMEOUT")
        throw error;
      fail(
        "PLAYER_UNAVAILABLE",
        "Chưa kết nối được player. Hãy tải lại tab YouTube sau khi cài/cập nhật extension.",
      );
    }
    const reply = record(raw);
    if (reply.requestId !== requestId || reply.ok !== true)
      fail("STALE_CONTEXT", "Video đã thay đổi. Hãy thử lại.");
    const report = validateReport(reply.result);
    const trusted = reports.get(tab.id);
    if (
      !trusted ||
      trusted.binding.documentToken !== report.documentToken ||
      trusted.binding.generation !== report.generation ||
      trusted.videoId !== fromUrl(tab.url) ||
      trusted.binding.windowId !== tab.windowId
    )
      fail("STALE_CONTEXT", "Player chưa xác thực đúng trang.");
    const snapshot: PlayerSnapshot = { ...report, binding: trusted.binding };
    if (expected && !sameBinding(expected, snapshot.binding))
      fail("STALE_CONTEXT", "Video đã thay đổi.");
    return snapshot;
  };
  const seek = async (
    pending: PendingSeek,
    expected?: PlayerBinding,
  ): Promise<void> => {
    if (inFlight.has(pending.requestId)) return;
    inFlight.add(pending.requestId);
    try {
      let snapshot: PlayerSnapshot | null = null;
      while (Date.parse(pending.expiresAt) > Date.parse(clock.now())) {
        const current = await store.get({ tabId: pending.targetTabId });
        if (current?.requestId !== pending.requestId)
          fail("STALE_CONTEXT", "Yêu cầu tua đã được thay thế.");
        const tab = await chromeCall(() => api.tabs.get(pending.targetTabId));
        const targetUrl = tab.pendingUrl || tab.url;
        if (targetUrl && fromUrl(targetUrl) !== pending.videoId)
          fail("STALE_CONTEXT", "Tab đã chuyển sang video khác.");
        if (expected && !tab.active)
          fail("STALE_CONTEXT", "Tab ghi chú không còn đang được hiển thị.");
        if (!tab.url) {
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
          continue;
        }
        try {
          snapshot = await captureTab(
            tab,
            expected,
            Date.parse(pending.expiresAt),
          );
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === "STALE_CONTEXT" || error.code === "SEEK_TIMEOUT")
          )
            throw error;
        }
        if (snapshot?.status === "ready") break;
        if (
          snapshot?.status === "ad" ||
          snapshot?.status === "live" ||
          snapshot?.status === "unavailable" ||
          snapshot?.status === "unsupported"
        )
          fail(
            "UNSUPPORTED",
            "Chưa hỗ trợ tua trong quảng cáo, live hoặc video không khả dụng.",
          );
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }
      if (!snapshot || snapshot.status !== "ready")
        fail("SEEK_TIMEOUT", "Player chưa sẵn sàng sau 15 giây. Hãy thử lại.");
      const binding = snapshot.binding;
      if (
        pending.documentId &&
        (pending.documentId !== binding.documentId ||
          pending.documentToken !== binding.documentToken ||
          pending.generation !== binding.generation)
      )
        fail("STALE_CONTEXT", "Trang đã thay đổi trong lúc chờ tua.");
      if (
        (await store.get({ tabId: pending.targetTabId }))?.requestId !==
        pending.requestId
      )
        fail("STALE_CONTEXT", "Yêu cầu tua đã thay đổi.");
      await store.put({
        ...pending,
        documentId: binding.documentId,
        documentToken: binding.documentToken,
        generation: binding.generation,
      });
      const raw = record(
        await bounded(
          chromeCall(() =>
            api.tabs.sendMessage(
              binding.tabId,
              {
                version: 1,
                op: "player.seek",
                requestId: pending.requestId,
                expected: binding,
                timestampSeconds: pending.timestampSeconds,
                expiresAt: pending.expiresAt,
              },
              { documentId: binding.documentId },
            ),
          ),
          Date.parse(pending.expiresAt),
        ),
      );
      if (raw.requestId !== pending.requestId || raw.ok !== true) {
        const e = raw.error as { code?: string; message?: string } | undefined;
        throw new AppError(
          e?.code === "SEEK_TIMEOUT" ? "SEEK_TIMEOUT" : "PLAYER_UNAVAILABLE",
          e?.message ?? "Player chưa xác nhận tua tới đoạn ghi chú.",
        );
      }
      const report = validateReport(raw.result);
      if (
        report.videoId !== binding.videoId ||
        report.documentToken !== binding.documentToken ||
        report.generation !== binding.generation
      )
        fail("STALE_CONTEXT", "Video đã đổi trước khi xác nhận tua.");
      const target = resolveSeekTarget(snapshot, pending.timestampSeconds);
      if (
        report.status !== "ready" ||
        report.currentTime === null ||
        Math.abs(report.currentTime - target) > 0.75
      )
        fail(
          "PLAYER_UNAVAILABLE",
          "Player chưa xác nhận tới đúng thời điểm ghi chú.",
        );
    } finally {
      inFlight.delete(pending.requestId);
      await store.remove({
        tabId: pending.targetTabId,
        requestId: pending.requestId,
      });
    }
  };
  const makePending = (
    tabId: number,
    videoId: string,
    timestampSeconds: number,
  ): PendingSeek => ({
    requestId: clock.newId(),
    targetTabId: tabId,
    videoId,
    timestampSeconds: validPosition(timestampSeconds),
    expiresAt: new Date(
      Date.parse(clock.now()) + SEEK_TIMEOUT_MS,
    ).toISOString(),
    documentId: null,
    documentToken: null,
    generation: null,
  });
  const coordinator: TabCoordinator = {
    acceptReport(report, sender) {
      if (
        sender.tab?.id === undefined ||
        sender.tab.windowId === undefined ||
        !sender.documentId ||
        report.videoId !== fromUrl(sender.url)
      )
        return;
      const old = reports.get(sender.tab.id);
      if (
        old?.binding.documentToken === report.documentToken &&
        old.binding.generation > report.generation
      )
        return;
      reports.set(sender.tab.id, {
        ...report,
        binding: {
          windowId: sender.tab.windowId,
          tabId: sender.tab.id,
          documentId: sender.documentId,
          documentToken: report.documentToken,
          generation: report.generation,
          videoId: report.videoId ?? "",
        },
      });
    },
    async getPlayerContext({ windowId }) {
      const [tab] = await api.tabs.query({ active: true, windowId });
      const id = fromUrl(tab?.url);
      const base: PlayerContext = {
        windowId,
        tabId: tab?.id ?? null,
        videoId: id,
        binding: null,
        player: null,
        status: "unsupported",
      };
      if (!tab || !id) return base;
      try {
        const player = await captureTab(tab);
        return {
          ...base,
          player,
          binding: player.binding,
          status: player.status,
        };
      } catch (e) {
        return {
          ...base,
          status:
            e instanceof AppError && e.code === "STALE_CONTEXT"
              ? "loading"
              : "reload-required",
        };
      }
    },
    async capturePlayer({ binding }) {
      const tab = await chromeCall(() => api.tabs.get(binding.tabId));
      if (
        !tab.active ||
        tab.windowId !== binding.windowId ||
        fromUrl(tab.pendingUrl || tab.url) !== binding.videoId
      )
        fail(
          "STALE_CONTEXT",
          "Tab ghi chú không còn đang được hiển thị hoặc đã thay đổi.",
        );
      return captureTab(tab, binding);
    },
    async resumePlayer({ binding }) {
      await coordinator.capturePlayer({ binding });
      const requestId = clock.newId();
      const reply = record(
        await bounded(
          chromeCall(() =>
            api.tabs.sendMessage(
              binding.tabId,
              {
                version: 1,
                requestId,
                op: "player.resume",
                expected: binding,
              },
              { documentId: binding.documentId },
            ),
          ),
          Date.parse(clock.now()) + SEEK_TIMEOUT_MS,
        ),
      );
      if (reply.requestId !== requestId || reply.ok !== true)
        fail(
          "PLAYER_UNAVAILABLE",
          "Ghi chú đã lưu nhưng video chưa phát tiếp. Hãy bấm Play.",
        );
      const report = validateReport(reply.result);
      if (
        report.videoId !== binding.videoId ||
        report.documentToken !== binding.documentToken ||
        report.generation !== binding.generation
      )
        fail("STALE_CONTEXT", "Không phát tiếp vì video đã thay đổi.");
    },
    async seekFromPanel({ binding, timestampSeconds }) {
      await coordinator.capturePlayer({ binding });
      const pending = {
        ...makePending(binding.tabId, binding.videoId, timestampSeconds),
        documentId: binding.documentId,
        documentToken: binding.documentToken,
        generation: binding.generation,
      };
      await store.put(pending);
      await seek(pending, binding);
    },
    async seekFromNotebook({ windowId, videoId, timestampSeconds }) {
      validPosition(timestampSeconds);
      const url = watchUrl(videoId);
      const matches = (await chromeCall(() => api.tabs.query({ windowId })))
        .filter((t) => fromUrl(t.pendingUrl || t.url) === videoId)
        .sort(
          (a, b) => Number(b.active) - Number(a.active) || a.index - b.index,
        );
      const tab =
        matches[0] ??
        (await chromeCall(() =>
          api.tabs.create({ windowId, url, active: true }),
        ));
      if (tab.id === undefined)
        fail("PLAYER_UNAVAILABLE", "Không mở được tab video.");
      await chromeCall(() => api.tabs.update(tab.id!, { active: true }));
      await chromeCall(() => api.windows.update(windowId, { focused: true }));
      const pending = makePending(tab.id, videoId, timestampSeconds);
      await store.put(pending);
      await seek(pending);
    },
    async openNotebook({ windowId, notebookId }) {
      const base = `chrome-extension://${input.extensionId}/notebook.html`;
      const target = notebookId
        ? `${base}?notebook=${encodeURIComponent(notebookId)}`
        : base;
      const existing = (
        await chromeCall(() => api.tabs.query({ windowId }))
      ).find((t) => t.url?.split("?")[0] === base);
      // Never navigate an existing reader: it may own unacknowledged input or an active search.
      if (existing?.id !== undefined)
        await chromeCall(() => api.tabs.update(existing.id!, { active: true }));
      else
        await chromeCall(() =>
          api.tabs.create({ windowId, url: target, active: true }),
        );
    },
    async onTabRemoved(tabId) {
      reports.delete(tabId);
      const old = await store.get({ tabId });
      if (old) await store.remove({ tabId, requestId: old.requestId });
    },
    async reconcilePending() {
      for (const pending of await store.list()) {
        if (inFlight.has(pending.requestId)) continue;
        if (
          !pending.documentId ||
          Date.parse(pending.expiresAt) <= Date.parse(clock.now())
        ) {
          await store.remove({
            tabId: pending.targetTabId,
            requestId: pending.requestId,
          });
          continue;
        }
        void seek(pending).catch(() => {
          /* Original UI request is gone after worker restart; no false success is sent. */
        });
      }
    },
  };
  return coordinator;
}
