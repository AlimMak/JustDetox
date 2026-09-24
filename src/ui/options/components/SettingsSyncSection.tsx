import { useCallback, useEffect, useState } from "react";
import { computeImportDiff } from "../../../core/protectedGate";
import type { Settings } from "../../../core/types";
import { useFriction } from "../context/FrictionContext";
import { sendBackgroundCommand } from "../utils/backgroundCommand";

interface SyncStatus {
  enabled: boolean;
  pending: boolean;
  remoteRevision: number | null;
  remoteSettings: Settings | null;
}

export function SettingsSyncSection({ settings, reloadSettings, flushSettings }: {
  settings: Settings;
  reloadSettings: () => Promise<void>;
  flushSettings: () => Promise<void>;
}) {
  const { askFriction } = useFriction();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await sendBackgroundCommand({ type: "GET_SYNC_STATUS" });
    if (!response.ok) throw new Error(response.error ?? "Could not load sync status.");
    setStatus({ enabled: response.enabled === true, pending: response.pending === true,
      remoteRevision: response.remoteRevision ?? null,
      remoteSettings: response.remoteSettings ?? null });
  }, []);

  useEffect(() => {
    void loadStatus().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load sync status.");
    });
  }, [loadStatus]);

  const act = async (action: "upload" | "download" | "disable") => {
    if (!status || working) return;
    setError(null);
    setNotice(null);
    try {
      await flushSettings();
    } catch {
      setError("Could not save current settings before syncing. Try again.");
      return;
    }
    if (action === "download") {
      if (!status.remoteSettings || status.remoteRevision === null) return;
      const incoming = { ...status.remoteSettings,
        preloadBlocking: settings.preloadBlocking,
        lockedInSession: settings.lockedInSession };
      const reductions = computeImportDiff(settings, incoming).reductions;
      if (reductions.length > 0 && !(await askFriction({
        actionType: "import-reduces-protection",
        label: "Apply synced settings",
        context: reductions,
      }))) return;
    }
    if (action === "upload" && status.remoteSettings) {
      const reductions = computeImportDiff(status.remoteSettings, settings).reductions;
      if (reductions.length > 0 && !(await askFriction({
        actionType: "import-reduces-protection",
        label: "Replace synced settings with this device",
        context: reductions,
      }))) return;
    }
    setWorking(true);
    try {
      const response = await sendBackgroundCommand({ type: "SYNC_ACTION", action,
        revision: status.remoteRevision });
      if (!response.ok) throw new Error(response.error ?? "Settings sync failed.");
      if (action === "download") await reloadSettings();
      await loadStatus();
      setNotice(action === "disable" ? "Sync is off on this device." :
        action === "upload" ? "This device's settings were saved to Chrome Sync." :
          "Synced settings were applied. Local usage history was kept.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Settings sync failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel-section">
      <p className="section-heading">Settings sync</p>
      <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
        Optional. Sync rules, goals, and focus presets between Chrome browsers signed into the same account. Usage history, active Locked In sessions, and pre-load permission stay on this device.
      </p>
      {!status && !error && <p className="field__hint">Loading sync status…</p>}
      {!status && error && <button className="btn btn-secondary btn--sm"
        onClick={() => void loadStatus().then(() => setError(null)).catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : "Could not load sync status."))}>
        Retry
      </button>}
      {status && (
        <>
          <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
            {status.enabled ? "Sync is on for this device." : "Sync is off for this device."}
            {status.pending ? " Changes from another device need your review." : ""}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
            {status.remoteSettings && (
              <button className="btn btn-primary btn--sm" disabled={working}
                onClick={() => void act("download")}>Use synced settings</button>
            )}
            <button className="btn btn-secondary btn--sm" disabled={working}
              onClick={() => void act("upload")}>
              {status.remoteSettings ? "Use this device's settings" : "Start settings sync"}
            </button>
            {status.enabled && <button className="btn btn-ghost btn--sm" disabled={working}
              onClick={() => void act("disable")}>Turn off sync</button>}
            <button className="btn btn-ghost btn--sm" disabled={working}
              onClick={() => void loadStatus().catch((cause: unknown) => setError(
                cause instanceof Error ? cause.message : "Could not refresh sync status."))}>Refresh status</button>
          </div>
        </>
      )}
      {notice && <p className="field__hint" role="status">{notice}</p>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </section>
  );
}
