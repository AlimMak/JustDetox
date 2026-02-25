// FILE: src/ui/options/components/SettingsPanel.tsx

import { useState } from "react";
import type { Settings } from "../../../core/types";
import { DomainPillInput } from "./DomainPillInput";
import { DEFAULT_FRICTION_SETTINGS } from "../../../core/types";

const RESET_PRESETS = [6, 12, 24, 48] as const;

interface SettingsPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
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
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Settings</h1>
          <p className="panel-subtitle">Global preferences.</p>
        </div>
      </div>

      {/* Reset window */}
      <section className="panel-section">
        <p className="section-heading">Reset window</p>

        <div className="seg" style={{ marginBottom: "var(--sp-3)" }}>
          {RESET_PRESETS.map((h) => (
            <button
              key={h}
              className={`seg__option${intervalHours === h ? " seg__option--active" : ""}`}
              onClick={() => patch({ resetWindow: { intervalHours: h } })}
            >
              {h}h
            </button>
          ))}
          <button
            className={`seg__option${isCustom ? " seg__option--active" : ""}`}
            onClick={() => setCustomHours(String(intervalHours))}
          >
            Custom
          </button>
        </div>

        {(isCustom || customHours !== "") && (
          <div className="field" style={{ marginBottom: "var(--sp-3)", maxWidth: 160 }}>
            <span className="field__label">Custom hours (1–168)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={168}
              value={customHours !== "" ? customHours : intervalHours}
              onChange={(e) => setCustomHours(e.target.value)}
              onBlur={applyCustomHours}
              onKeyDown={(e) => e.key === "Enter" && applyCustomHours()}
            />
          </div>
        )}

        <p className="reset-window-hint">
          Usage counters reset every {intervalHours}h. Changing this does not erase existing data.
        </p>
      </section>

      {/* Always blocked */}
      <section className="panel-section">
        <p className="section-heading">Always blocked</p>
        <div className="field">
          <DomainPillInput
            domains={settings.globalBlockList}
            onChange={(list) => patch({ globalBlockList: list })}
            placeholder="reddit.com, tiktok.com…"
          />
          <p className="field__hint">
            Blocked globally regardless of any group or site rule.
          </p>
        </div>
      </section>

      {/* Friction Layer */}
      <section className="panel-section">
        <p className="section-heading">Behavior</p>

        {/* Enable Friction Layer */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Enable Friction Layer</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Show a pause screen before relaxing any block or limit.
            </p>
          </div>
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={settings.friction?.enabled ?? DEFAULT_FRICTION_SETTINGS.enabled}
              onChange={(e) =>
                patch({
                  friction: {
                    ...(settings.friction ?? DEFAULT_FRICTION_SETTINGS),
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Require reflection text */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Require reflection text</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Force a written reason before the change is allowed through.
            </p>
          </div>
          <label className={`toggle${!(settings.friction?.enabled ?? DEFAULT_FRICTION_SETTINGS.enabled) ? " toggle--disabled" : ""}`}>
            <input
              className="toggle__input"
              type="checkbox"
              disabled={!(settings.friction?.enabled ?? DEFAULT_FRICTION_SETTINGS.enabled)}
              checked={settings.friction?.requireReflection ?? DEFAULT_FRICTION_SETTINGS.requireReflection}
              onChange={(e) =>
                patch({
                  friction: {
                    ...(settings.friction ?? DEFAULT_FRICTION_SETTINGS),
                    requireReflection: e.target.checked,
                  },
                })
              }
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Log reflections locally */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Log reflections locally</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Store reflection notes in local extension storage (never synced).
            </p>
          </div>
          <label className={`toggle${!(settings.friction?.enabled ?? DEFAULT_FRICTION_SETTINGS.enabled) ? " toggle--disabled" : ""}`}>
            <input
              className="toggle__input"
              type="checkbox"
              disabled={!(settings.friction?.enabled ?? DEFAULT_FRICTION_SETTINGS.enabled)}
              checked={settings.friction?.logReflections ?? DEFAULT_FRICTION_SETTINGS.logReflections}
              onChange={(e) =>
                patch({
                  friction: {
                    ...(settings.friction ?? DEFAULT_FRICTION_SETTINGS),
                    logReflections: e.target.checked,
                  },
                })
              }
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>
      </section>
    </div>
  );
}
