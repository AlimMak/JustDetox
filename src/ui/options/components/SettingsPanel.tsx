import { useState } from "react";
import type { Settings } from "../../../core/types";
import { DomainPillInput } from "./DomainPillInput";

const RESET_PRESETS = [6, 12, 24, 48] as const;

interface SettingsPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-track${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

export function SettingsPanel({ settings, patch }: SettingsPanelProps) {
  const [customHours, setCustomHours] = useState<string>("");
  const { intervalHours } = settings.resetWindow;
  const isCustom = !RESET_PRESETS.includes(intervalHours as (typeof RESET_PRESETS)[number]);

  const applyCustomHours = () => {
    const h = parseInt(customHours, 10);
    if (h >= 1 && h <= 168) {
      patch({ resetWindow: { intervalHours: h } });
      setCustomHours("");
    }
  };

  return (
    <div className="panel-content">
      <h1 className="panel-title">Settings</h1>
      <p className="panel-subtitle">Global preferences for JustDetox.</p>

      {/* Master toggle */}
      <section className="panel-section">
        <p className="panel-section-title">Extension</p>
        <div className={`master-toggle-card${settings.disabled ? " disabled-state" : ""}`}>
          <div>
            <p className="master-toggle-label">
              {settings.disabled ? "Extension disabled" : "Extension enabled"}
            </p>
            <p className="muted" style={{ marginTop: 2 }}>
              {settings.disabled
                ? "No sites are being blocked or tracked."
                : "Sites are blocked and time is tracked per your rules."}
            </p>
          </div>
          <Toggle
            checked={!settings.disabled}
            onChange={(enabled) => patch({ disabled: !enabled })}
            label="Enable extension"
          />
        </div>
      </section>

      {/* Reset window */}
      <section className="panel-section">
        <p className="panel-section-title">Usage reset window</p>
        <p className="muted" style={{ marginBottom: 10 }}>
          Time counters reset after this interval. Current:{" "}
          <strong style={{ color: "#ccc" }}>{intervalHours}h</strong>
        </p>
        <div className="preset-group">
          {RESET_PRESETS.map((h) => (
            <button
              key={h}
              className={`preset-btn${intervalHours === h ? " active" : ""}`}
              onClick={() => patch({ resetWindow: { intervalHours: h } })}
            >
              {h}h
            </button>
          ))}
          <button
            className={`preset-btn${isCustom ? " active" : ""}`}
            onClick={() => setCustomHours(String(intervalHours))}
          >
            Custom
          </button>
        </div>
        {(isCustom || customHours !== "") && (
          <div className="form-row" style={{ marginTop: 10, maxWidth: 160 }}>
            <label className="form-label">
              Custom hours (1–168)
              <input
                type="number"
                min={1}
                max={168}
                value={customHours !== "" ? customHours : intervalHours}
                onChange={(e) => setCustomHours(e.target.value)}
                onBlur={applyCustomHours}
                onKeyDown={(e) => e.key === "Enter" && applyCustomHours()}
              />
            </label>
          </div>
        )}
      </section>

      {/* Always-blocked quick list */}
      <section className="panel-section">
        <p className="panel-section-title">Always blocked</p>
        <p className="muted" style={{ marginBottom: 10 }}>
          Domains blocked globally, regardless of any group or site rule.
        </p>
        <DomainPillInput
          domains={settings.globalBlockList}
          onChange={(list) => patch({ globalBlockList: list })}
          placeholder="reddit.com, tiktok.com…"
        />
      </section>
    </div>
  );
}
