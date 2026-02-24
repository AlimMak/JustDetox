import { useRef, useState } from "react";
import type { Settings } from "../../../core/types";
import { exportAll, getSettings, importAll } from "../../../core/storage";
import { parseImportJson } from "../../../core/validation";
import type { ValidatedFullExport } from "../../../core/validation";

interface ImportExportPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings> | ((prev: Settings) => Settings)) => void;
}

type ExportMode = "settings" | "full";

interface ImportPreview {
  json: string;
  data: ValidatedFullExport;
}

export function ImportExportPanel({ patch }: ImportExportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportMode, setExportMode] = useState<ExportMode>("settings");
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      let json: string;
      let filename: string;

      if (exportMode === "full") {
        json = await exportAll();
        filename = `justdetox-backup-${date}.json`;
      } else {
        const s = await getSettings();
        json = JSON.stringify(
          { exportedAt: new Date().toISOString(), settings: s },
          null,
          2,
        );
        filename = `justdetox-settings-${date}.json`;
      }

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportDone(false);
    setPreview(null);

    const text = await file.text();
    const result = parseImportJson(text);

    if (!result.ok) {
      setImportError(result.error);
    } else {
      setPreview({ json: text, data: result.data });
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const handleApply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const result = await importAll(preview.json);
      if (result.ok) {
        const fresh = await getSettings();
        patch(() => fresh);
        setPreview(null);
        setImportDone(true);
      } else {
        setImportError(result.error);
        setPreview(null);
      }
    } finally {
      setApplying(false);
    }
  };

  const usageCount = preview
    ? Object.keys(preview.data.usage ?? {}).length
    : 0;

  return (
    <div className="panel-content">
      <h1 className="panel-title">Import / Export</h1>
      <p className="panel-subtitle">
        Back up your rules and usage, or restore from a previous backup.
      </p>

      {/* ── Export ── */}
      <section className="panel-section">
        <p className="panel-section-title">Export</p>

        <div className="preset-group" style={{ marginBottom: 12 }}>
          <button
            className={`preset-btn${exportMode === "settings" ? " active" : ""}`}
            onClick={() => setExportMode("settings")}
          >
            Settings only
          </button>
          <button
            className={`preset-btn${exportMode === "full" ? " active" : ""}`}
            onClick={() => setExportMode("full")}
          >
            Full backup
          </button>
        </div>

        <p className="muted" style={{ marginBottom: 12 }}>
          {exportMode === "settings"
            ? "Downloads your rules and configuration. Safe to share or migrate between devices."
            : "Downloads settings plus all tracked usage data. Useful for full device backups."}
        </p>

        <button
          className="btn-primary"
          style={{ width: "auto", padding: "7px 16px" }}
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? "Exporting…" : "↓ Download"}
        </button>
      </section>

      {/* ── Import ── */}
      <section className="panel-section">
        <p className="panel-section-title">Import</p>

        {!preview && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              Restore settings from a previously exported file.{" "}
              <strong style={{ color: "#aaa" }}>
                This overwrites your current data.
              </strong>
            </p>
            <label className="import-dropzone">
              <span>Click to choose a backup file</span>
              <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                .json files only
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => void handleFileChange(e)}
              />
            </label>
          </>
        )}

        {importError && (
          <p
            className="form-error"
            style={{ marginTop: 10, whiteSpace: "pre-wrap" }}
          >
            {importError}
          </p>
        )}

        {importDone && (
          <p className="import-success" style={{ marginTop: 10 }}>
            Backup restored successfully.
          </p>
        )}

        {/* Preview / confirm card */}
        {preview && (
          <div className="about-card">
            {preview.data.exportedAt && (
              <div className="about-row">
                <span className="about-label">Exported on</span>
                <span className="about-value">
                  {new Date(preview.data.exportedAt).toLocaleString()}
                </span>
              </div>
            )}

            <div className="about-row">
              <span className="about-label">Groups</span>
              <span className="about-value">
                {preview.data.settings.groups.length}
              </span>
            </div>

            <div className="about-row">
              <span className="about-label">Site rules</span>
              <span className="about-value">
                {preview.data.settings.siteRules.length}
              </span>
            </div>

            <div className="about-row">
              <span className="about-label">Always-blocked</span>
              <span className="about-value">
                {preview.data.settings.globalBlockList.length}
              </span>
            </div>

            {usageCount > 0 && (
              <div className="about-row">
                <span className="about-label">Usage entries</span>
                <span className="about-value">{usageCount}</span>
              </div>
            )}

            <div className="about-row" style={{ gap: 12 }}>
              <span className="muted" style={{ fontSize: 11 }}>
                This will overwrite all current data.
              </span>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => setPreview(null)}
                  disabled={applying}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary btn-sm"
                  style={{ width: "auto" }}
                  onClick={() => void handleApply()}
                  disabled={applying}
                >
                  {applying ? "Applying…" : "Apply"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
