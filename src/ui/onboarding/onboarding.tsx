import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./onboarding.css";
import { getSettings, setSettings } from "../../core/storage";
import type { SiteGroup } from "../../core/types";

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "social",
    name: "Social Media",
    description: "Facebook, Instagram, X, TikTok, Snapchat",
    domains: [
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "tiktok.com",
      "snapchat.com",
    ],
  },
  {
    id: "news",
    name: "News & Forums",
    description: "Reddit, Hacker News, CNN, BBC",
    domains: ["reddit.com", "news.ycombinator.com", "cnn.com", "bbc.com"],
  },
  {
    id: "video",
    name: "Video",
    description: "YouTube, Twitch, Netflix",
    domains: ["youtube.com", "twitch.tv", "netflix.com"],
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

const INTERVAL_OPTIONS = [
  { value: 6,  label: "6h"  },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
] as const;

type Step = 1 | 2 | 3;

// ─── Component ────────────────────────────────────────────────────────────────

function Onboarding() {
  const [step, setStep]                     = useState<Step>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [limitMinutes, setLimitMinutes]     = useState(60);
  const [intervalHours, setIntervalHours]   = useState<number>(24);
  const [saving, setSaving]                 = useState(false);

  const toggleTemplate = (id: TemplateId) => {
    setSelectedTemplate((prev) => (prev === id ? null : id));
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const settings = await getSettings();
      const updated = { ...settings, resetWindow: { intervalHours } };

      if (selectedTemplate !== null) {
        const tpl = TEMPLATES.find((t) => t.id === selectedTemplate)!;
        const group: SiteGroup = {
          id: crypto.randomUUID(),
          name: tpl.name,
          domains: [...tpl.domains],
          mode: "limit",
          limitMinutes,
          enabled: true,
        };
        updated.groups = [...settings.groups, group];
      }

      await setSettings(updated);
      window.close();
    } catch {
      setSaving(false);
    }
  };

  const selectedTpl = TEMPLATES.find((t) => t.id === selectedTemplate);

  return (
    <div className="ob-root">
      <div className="ob-card">

        {/* Brand */}
        <div className="ob-brand">JustDetox</div>

        {/* Step indicator */}
        <div className="ob-steps">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`ob-step-dot${
                step === s
                  ? " ob-step-dot--active"
                  : step > s
                    ? " ob-step-dot--done"
                    : ""
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Choose template ──────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="ob-title">Which sites distract you most?</h1>
            <p className="ob-sub">
              Choose a preset to create your first blocking group, or skip.
            </p>

            <div className="ob-templates">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`ob-template-card${
                    selectedTemplate === tpl.id
                      ? " ob-template-card--selected"
                      : ""
                  }`}
                  onClick={() => toggleTemplate(tpl.id)}
                >
                  <span className="ob-template-name">{tpl.name}</span>
                  <span className="ob-template-domains">{tpl.description}</span>
                </button>
              ))}
            </div>

            <div className="ob-actions">
              <button
                className="btn btn-primary btn--lg"
                style={{ width: "100%" }}
                onClick={() => setStep(2)}
              >
                {selectedTemplate ? "Continue" : "Skip for now →"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Set limits ───────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 className="ob-title">Set your limits</h1>
            <p className="ob-sub">
              How long should you allow each reset window?
            </p>

            {selectedTpl && (
              <div className="ob-field">
                <label className="ob-field-label">
                  {selectedTpl.name} — daily limit
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-3)",
                  }}
                >
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={1440}
                    value={limitMinutes}
                    onChange={(e) =>
                      setLimitMinutes(
                        Math.max(
                          1,
                          Math.min(1440, parseInt(e.target.value) || 60),
                        ),
                      )
                    }
                    style={{ width: 80 }}
                  />
                  <span
                    style={{
                      color: "var(--text-3)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    minutes
                  </span>
                </div>
              </div>
            )}

            <div className="ob-field">
              <label className="ob-field-label">Reset window</label>
              <div className="seg">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`seg__option${
                      intervalHours === opt.value ? " seg__option--active" : ""
                    }`}
                    onClick={() => setIntervalHours(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-3)",
                  marginTop: "var(--sp-2)",
                }}
              >
                Counters reset every {intervalHours} hours.
              </p>
            </div>

            <div className="ob-actions">
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary btn--lg"
                style={{ flex: 1 }}
                onClick={() => setStep(3)}
              >
                Review →
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Confirm ──────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 className="ob-title">Ready to go.</h1>
            <p className="ob-sub">Here's what will be created:</p>

            <div className="ob-summary">
              {selectedTpl ? (
                <div className="ob-summary-item">
                  <span className="ob-summary-key">Group</span>
                  <span className="ob-summary-val">
                    {selectedTpl.name} — {limitMinutes} min/window
                  </span>
                </div>
              ) : (
                <div className="ob-summary-item">
                  <span className="ob-summary-key">Group</span>
                  <span
                    className="ob-summary-val"
                    style={{ color: "var(--text-3)" }}
                  >
                    None (add later in Settings)
                  </span>
                </div>
              )}
              <div className="ob-summary-item">
                <span className="ob-summary-key">Reset every</span>
                <span className="ob-summary-val">{intervalHours}h</span>
              </div>
            </div>

            <p
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-3)",
                lineHeight: 1.6,
                marginTop: "var(--sp-4)",
              }}
            >
              You can edit groups and add per-site rules at any time from the
              extension settings.
            </p>

            <div className="ob-actions">
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setStep(2)}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary btn--lg"
                style={{ flex: 1 }}
                onClick={() => void handleFinish()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Get started"}
              </button>
            </div>
          </>
        )}

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
