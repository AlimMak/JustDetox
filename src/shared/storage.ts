import type { StorageSchema } from "./types";
import { STORAGE_DEFAULTS } from "./types";

/** Read all persisted data, filling in defaults for missing keys. */
export async function readStorage(): Promise<StorageSchema> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_DEFAULTS, (result) => {
      resolve(result as StorageSchema);
    });
  });
}

/** Persist a partial update (deep-merged at the top level). */
export async function writeStorage(patch: Partial<StorageSchema>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(patch, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}
