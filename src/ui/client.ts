import { AppError } from "../domain/types";
import type { CommandMap, Invalidation, Reply } from "../shared/protocol";
export interface Client {
  call<K extends keyof CommandMap>(
    op: K,
    payload: CommandMap[K]["input"],
  ): Promise<CommandMap[K]["output"]>;
  subscribe(onChange: (event: Invalidation) => void): () => void;
}
/** Iframe authority: the token is read per call so it can be replaced without remounting. */
export interface ClientAuth {
  session(): string | undefined;
  /** Called when the worker rejects the panel session. The failed request is not retried. */
  onAuthFailure(): void;
}
async function exchange(
  op: string,
  fields: { payload?: unknown; panelSession?: string },
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  let reply: Reply;
  try {
    reply = await chrome.runtime.sendMessage({
      version: 1,
      requestId,
      op,
      ...fields,
    });
  } catch {
    throw new AppError(
      "PLAYER_UNAVAILABLE",
      "Mất kết nối extension. Nội dung đang nhập vẫn được giữ; hãy thử lại.",
    );
  }
  if (
    !reply ||
    reply.version !== 1 ||
    reply.requestId !== requestId ||
    reply.op !== op
  )
    throw new AppError("STALE_CONTEXT", "Phản hồi không khớp yêu cầu.");
  if (!reply.ok)
    throw new AppError(
      reply.error?.code ?? "STORAGE_FAILED",
      reply.error?.message ?? "Thao tác chưa hoàn tất.",
    );
  return reply.result;
}
/** Presents the handshake token from an extension-origin iframe; resolves with the worker's window id. */
export async function attachPanel(
  session: string,
): Promise<{ windowId: number }> {
  const result = await exchange("panel.attach", { panelSession: session });
  const windowId =
    result && typeof result === "object"
      ? (result as { windowId?: unknown }).windowId
      : undefined;
  if (typeof windowId !== "number" || !Number.isSafeInteger(windowId))
    throw new AppError("STALE_CONTEXT", "Phản hồi không khớp yêu cầu.");
  return { windowId };
}
export function createClient(auth?: ClientAuth): Client {
  return {
    async call(op, payload) {
      const panelSession = auth?.session();
      try {
        return (await exchange(op, {
          payload,
          ...(panelSession ? { panelSession } : {}),
        })) as never;
      } catch (error) {
        if (
          auth &&
          error instanceof AppError &&
          error.code === "UNAUTHORIZED"
        ) {
          auth.onAuthFailure();
          throw new AppError(
            "UNAUTHORIZED",
            "Phiên ghi chú đã hết hạn. Nội dung đang nhập vẫn được giữ; đang kết nối lại.",
          );
        }
        throw error;
      }
    },
    subscribe(onChange) {
      const listener = (
        message: Invalidation,
        sender: chrome.runtime.MessageSender,
      ) => {
        if (
          sender.id === chrome.runtime.id &&
          message?.version === 1 &&
          message.op === "invalidate"
        )
          onChange(message);
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };
}
