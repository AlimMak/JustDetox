import { useRef, useState } from "react";
import type { Settings } from "../../../core/types";
import { exportAll, importAll } from "../../../core/storage";

interface ImportExportPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings> | ((prev: Settings) => Settings)) => void;
}

export function ImportExportPanel({ patch }: ImportExportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportAll();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `justdetox-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    const text = await file.text();
    const result = await importAll(text);

    if (result.ok) {
      // Reload settings into React state
      const { getSettings } = await import("../../../core/storage");
      const fresh = await getSettings();
      patch(() => fresh);
      setImportStatus({ ok: true, msg: "Backup restored successfully." });
    } else {
      setImportStatus({ ok: false, msg: result.error });
    }

    // Reset file input so the same file can be re-imported
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="panel-content">
      <h1 className="panel-title">Import / Export</h1>
      <p className="panel-subtitle">Back up your rules and usage, or restore from a previous backup.</p>

      <section className="panel-section">
        <p className="panel-section-title">Export</p>
        <p className="muted" style={{ marginBottom: 12 }}>
          Downloads a JSON file with all your settings and usage data.
        </p>
        <button className="btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Download backup"}
        </button>
      </section>

      <section className="panel-section">
        <p className="panel-section-title">Import</p>
        <p className="muted" style={{ marginBottom: 12 }}>
          Restores settings and usage from a previously exported backup.{" "}
          <strong style={{ color: "#aaa" }}>This overwrites your current data.</strong>
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
            onChange={handleFileChange}
          />
        </label>

        {importStatus && (
          <p
            className={importStatus.ok ? "import-success" : "form-error"}
            style={{ marginTop: 10 }}
          >
            {importStatus.msg}
          </p>
        )}
      </section>
    </div>
  );
}
