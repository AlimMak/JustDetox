import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./onboarding.css";
import { getSettings, setSettings } from "../../core/storage";
import type { SiteGroup } from "../../core/types";

// ─── Preset domain lists ──────────────────────────────────────────────────────

const PRESETS = {
  social: {
    name: "Social Media",
    domains: [
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "tiktok.com",
      "snapchat.com",
    ],
  },
  news: {
    name: "News & Forums",
    domains: [
      "reddit.com",
      "news.ycombinator.com",
      "cnn.com",
      "bbc.com",
      "nytimes.com",
    ],
  },
} as const;

type PresetKey = keyof typeof PRESETS | null;

// ─── Component ────────────────────────────────────────────────────────────────

function Onboarding() {
  const [preset, setPreset] = useState<PresetKey>(null);
  const [intervalHours, setIntervalHours] = useState(24);
  const [saving, setSaving] = useState(false);

  const togglePreset = (key: PresetKey) => {
    setPreset((prev) => (prev === key ? null : key));
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      const settings = await getSettings();
      const updatedSettings = {
        ...settings,
        resetWindow: { intervalHours },
      };

      if (preset !== null) {
        const group: SiteGroup = {
          id: crypto.randomUUID(),
          name: PRESETS[preset].name,
          domains: [...PRESETS[preset].domains],
          mode: "limit",
          limitMinutes: 60,
          enabled: true,
        };
        updatedSettings.groups = [...settings.groups, group];
      }

      await setSettings(updatedSettings);
      window.close();
    } catch {
      setSaving(false);
    }
  };

  const activePreset = preset !== null ? PRESETS[preset] : null;

  return (
    <div className="onboarding-root">
      <div className="onboarding-card">
        <div className="onboarding-logo">JustDetox</div>

        <h1 className="onboarding-title">Take back your focus.</h1>
        <p className="onboarding-body">
          Block or time-limit the sites that drain your attention. No accounts,
          no cloud, no noise — just you and your rules.
        </p>

        {/* Preset group selection */}
        <section className="onboarding-section">
          <p className="onboarding-section-label">
            Start with a group (optional)
          </p>
          <div className="preset-group">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <button
                key={key!}
                className={`preset-btn${preset === key ? " active" : ""}`}
                onClick={() => togglePreset(key)}
              >
                {PRESETS[key!].name}
              </button>
            ))}
          </div>
          {activePreset && (
            <p className="onboarding-hint">
              {activePreset.domains.join(", ")} — 60 min/day limit. You can
              edit this later in Settings.
            </p>
          )}
          {preset === null && (
            <p className="onboarding-hint">
              Skip for now — you can create groups from the Settings page.
            </p>
          )}
        </section>

        {/* Reset window */}
        <section className="onboarding-section">
          <p className="onboarding-section-label">Reset window</p>
          <div className="preset-group">
            {([6, 12, 24, 48] as const).map((h) => (
              <button
                key={h}
                className={`preset-btn${intervalHours === h ? " active" : ""}`}
                onClick={() => setIntervalHours(h)}
              >
                {h}h
              </button>
            ))}
          </div>
          <p className="onboarding-hint">
            Usage counters reset every {intervalHours} hours.
          </p>
        </section>

        <button
          className="onboarding-cta"
          onClick={() => void handleStart()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Get started →"}
        </button>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <StrictMode>
    <Onboarding />
  </StrictMode>,
);
