export interface BackgroundCommandResult {
  ok: boolean;
  error?: string;
  json?: string;
  enabled?: boolean;
  pending?: boolean;
  remoteRevision?: number | null;
  remoteSettings?: import("../../../core/types").Settings | null;
}

/** Send a storage command to the service worker, where pending writes are serialized. */
export function sendBackgroundCommand(message: {
  type: string; json?: string; action?: "upload" | "download" | "disable"; revision?: number | null;
}): Promise<BackgroundCommandResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          resolve({ ok: false, error: runtimeError });
          return;
        }
        if (typeof response === "object" && response !== null && "ok" in response) {
          resolve(response as BackgroundCommandResult);
          return;
        }
        resolve({ ok: false, error: "The background service did not respond. Try again." });
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : "Could not contact the background service." });
    }
  });
}
