import type { PendingSeek } from "../domain/types";
import { request, transact } from "./database";
export interface PendingSeekStore {
  get(input: { tabId: number }): Promise<PendingSeek | null>;
  put(input: PendingSeek): Promise<void>;
  remove(input: { tabId: number; requestId: string }): Promise<void>;
  list(): Promise<PendingSeek[]>;
}
export function createPendingSeekStore(db: IDBDatabase): PendingSeekStore {
  return {
    get: (input) =>
      transact(
        db,
        ["pendingSeeks"],
        "readonly",
        async (tx) =>
          (await request<PendingSeek | undefined>(
            tx.objectStore("pendingSeeks").get(input.tabId),
          )) ?? null,
      ),
    put: (input) =>
      transact(db, ["pendingSeeks"], "readwrite", async (tx) => {
        await request(tx.objectStore("pendingSeeks").put(input));
      }),
    remove: (input) =>
      transact(db, ["pendingSeeks"], "readwrite", async (tx) => {
        const store = tx.objectStore("pendingSeeks");
        const old = await request<PendingSeek | undefined>(
          store.get(input.tabId),
        );
        if (old?.requestId === input.requestId)
          await request(store.delete(input.tabId));
      }),
    list: () =>
      transact(db, ["pendingSeeks"], "readonly", (tx) =>
        request<PendingSeek[]>(tx.objectStore("pendingSeeks").getAll()),
      ),
  };
}
