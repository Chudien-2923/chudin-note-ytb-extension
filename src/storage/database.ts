import { AppError, asAppError, type FailureCode } from "../domain/types";
export const STORE_NAMES = [
  "notebooks",
  "videos",
  "notes",
  "drafts",
  "pendingSeeks",
] as const;
// Constructor form is intentional: Promise.withResolvers is newer than Chrome 116.
export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function openDatabase(
  factory: IDBFactory = indexedDB,
  name = "chudin-note-youtube",
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let rejected = false;
    const opening = factory.open(name, 1);
    const failure = (code: FailureCode, message: string) => {
      rejected = true;
      reject(new AppError(code, message));
    };
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore("notebooks", { keyPath: "id" });
      db.createObjectStore("videos", { keyPath: "videoId" }).createIndex(
        "notebookId",
        "notebookId",
      );
      db.createObjectStore("notes", { keyPath: "id" }).createIndex(
        "videoId",
        "videoId",
      );
      const drafts = db.createObjectStore("drafts", { keyPath: "id" });
      drafts.createIndex("videoId", "videoId");
      drafts.createIndex("writerId", "writerId");
      db.createObjectStore("pendingSeeks", { keyPath: "targetTabId" });
    };
    opening.onerror = () =>
      failure(
        opening.error?.name === "VersionError"
          ? "SCHEMA_UNSUPPORTED"
          : "STORAGE_FAILED",
        opening.error?.name === "VersionError"
          ? "Dữ liệu thuộc phiên bản mới hơn. Không ghi đè; hãy cập nhật extension."
          : "Không mở được dữ liệu ghi chú. Không xóa dữ liệu để thử lại.",
      );
    opening.onblocked = () =>
      failure(
        "STORAGE_FAILED",
        "Dữ liệu đang được phiên bản khác mở. Hãy đóng các trang extension rồi thử lại.",
      );
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => db.close();
      if (rejected) db.close();
      else resolve(db);
    };
  });
}
export function transact<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      reject(asAppError(error));
      return;
    }
    let value: T;
    let failure: unknown;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () =>
      reject(
        failure instanceof AppError ? failure : asAppError(failure ?? tx.error),
      );
    tx.onerror = () => {
      /* Abort is the single failure/rollback boundary. */
    };
    work(tx)
      .then((result) => {
        value = result;
      })
      .catch((error) => {
        failure = error;
        try {
          tx.abort();
        } catch {
          reject(asAppError(error));
        }
      });
  });
}
