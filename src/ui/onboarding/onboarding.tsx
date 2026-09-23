import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared.css";
import "./onboarding.css";
import { getSettings, setSettings } from "../../core/storage";
import { getAllCategoryPacks } from "../../core/categoryPacks";
import type { RuleMode } from "../../core/types";
import {
  buildOnboardingSettings,
  parseCustomDomains,
  type RuleChoice,
  type SetupChoice,
} from "./utils/setup";

const PACKS = getAllCategoryPacks();
const CUSTOM_ID = "custom";
const INTERVAL_OPTIONS = [6, 12, 24, 48] as const;
type Step = 1 | 2 | 3 | 4;

export function Onboarding() {
  const [step, setStep] = useState<Step>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, RuleChoice>>(() => ({
    ...Object.fromEntries(
      PACKS.map((pack) => [
        pack.id,
        {
          mode: pack.defaultMode ?? "limit",
          limitMinutes: pack.suggestedLimitMinutes ?? 60,
        },
      ]),
    ),
    [CUSTOM_ID]: { mode: "limit", limitMinutes: 60 },
  }));
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const selectedPacks = PACKS.filter((pack) => selectedIds.includes(pack.id));
  const customDomains = parseCustomDomains(customInput).domains;
  const hasRules = selectedPacks.length > 0 || customDomains.length > 0;
  const assignedDomains = new Set<string>();
  const assignedCounts = Object.fromEntries(
    selectedPacks.map((pack) => {
      const fresh = pack.domains.filter((domain) => !assignedDomains.has(domain));
      fresh.forEach((domain) => assignedDomains.add(domain));
      return [pack.id, fresh.length];
    }),
  );
  const customAssignedCount = customDomains.filter((domain) => !assignedDomains.has(domain)).length;
  const selectedChoices: SetupChoice[] = selectedPacks.map((pack) => ({
    packId: pack.id,
    ...choices[pack.id],
  }));

  const changeChoice = (id: string, patch: Partial<RuleChoice>) => {
    setChoices((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const togglePack = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const continueFromSites = () => {
    const parsed = parseCustomDomains(customInput);
    if (parsed.error) {
      setCustomError(parsed.error);
      return;
    }
    setCustomError(null);
    setStep(2);
  };

  const validLimits = [
    ...selectedPacks.map((pack) => choices[pack.id]),
    ...(customDomains.length > 0 ? [choices[CUSTOM_ID]] : []),
  ].every(
    (choice) =>
      choice.mode === "block" ||
      (Number.isInteger(choice.limitMinutes) &&
        choice.limitMinutes >= 1 &&
        choice.limitMinutes <= 1440),
  );

  const handleFinish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const parsed = parseCustomDomains(customInput);
      if (parsed.error) throw new Error(parsed.error);
      const settings = await getSettings();
      const updated = buildOnboardingSettings(
        settings,
        selectedChoices,
        parsed.domains,
        choices[CUSTOM_ID],
        intervalHours,
        () => crypto.randomUUID(),
      );
      await setSettings(updated);
      setCreatedCount(updated.groups.length - settings.groups.length);
      setStep(4);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save your setup. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const renderRuleChoice = (id: string, name: string) => {
    const choice = choices[id];
    return (
      <div className="ob-rule-choice" key={id}>
        <div className="ob-rule-choice-header">
          <span className="ob-field-label">{name}</span>
          <span className="ob-rule-choice-caption">per reset window</span>
        </div>
        <div className="seg" role="group" aria-label={`${name} rule`}>
          {(["block", "limit"] as RuleMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`seg__option${choice.mode === mode ? " seg__option--active" : ""}`}
              aria-pressed={choice.mode === mode}
              onClick={() => changeChoice(id, { mode })}
            >
              {mode === "block" ? "Block" : "Time limit"}
            </button>
          ))}
        </div>
        {choice.mode === "limit" && (
          <div className="ob-limit-row">
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              value={choice.limitMinutes}
              aria-label={`${name} limit in minutes`}
              onChange={(event) => changeChoice(id, { limitMinutes: Number(event.target.value) })}
            />
            <span>minutes</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ob-root">
      <div className="ob-card">
        <div className="ob-brand">JustDetox</div>
        <div className="ob-steps" aria-label={step === 4 ? "Setup complete" : `Step ${step} of 3`}>
          {([1, 2, 3] as const).map((value) => (
            <div
              key={value}
              className={`ob-step-dot${step === value ? " ob-step-dot--active" : step > value ? " ob-step-dot--done" : ""}`}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className="ob-title">Which sites distract you most?</h1>
            <p className="ob-sub">
              Choose any categories and add your own websites. You can change these later.
            </p>
            <div className="ob-templates">
              {PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className={`ob-template-card${selectedIds.includes(pack.id) ? " ob-template-card--selected" : ""}`}
                  aria-pressed={selectedIds.includes(pack.id)}
                  onClick={() => togglePack(pack.id)}
                >
                  <span className="ob-template-title-row">
                    <span className="ob-template-name">{pack.name}</span>
                    <span className="ob-template-count">{pack.domains.length} sites</span>
                  </span>
                  <span className="ob-template-domains">
                    {pack.domains.slice(0, 4).join(", ")}
                    {pack.domains.length > 4 ? "…" : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="ob-field">
              <label className="ob-field-label" htmlFor="ob-custom-domains">
                Add your own sites
              </label>
              <textarea
                id="ob-custom-domains"
                className="input ob-custom-input"
                value={customInput}
                placeholder="example.com, another-site.com"
                onChange={(event) => {
                  setCustomInput(event.target.value);
                  setCustomError(null);
                }}
              />
              <p className="ob-field-hint">Separate websites with commas or new lines.</p>
              {customError && (
                <p className="ob-error" role="alert">
                  {customError}
                </p>
              )}
            </div>
            <div className="ob-actions">
              <button
                className="btn btn-primary btn--lg ob-primary-action"
                onClick={continueFromSites}
              >
                {hasRules ? "Continue →" : "Skip for now →"}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="ob-title">Choose your rules</h1>
            <p className="ob-sub">
              Block categories outright or set a shared time limit for each group.
            </p>
            {selectedPacks.length > 1 && (
              <p className="ob-field-hint ob-overlap-hint">
                Sites shared by categories use the first category shown.
              </p>
            )}
            {selectedPacks.map((pack) => renderRuleChoice(pack.id, pack.name))}
            {customAssignedCount > 0 &&
              renderRuleChoice(CUSTOM_ID, `My sites (${customAssignedCount})`)}
            {customDomains.length > 0 && customAssignedCount === 0 && (
              <p className="ob-empty-note">Your custom sites are already in a selected category.</p>
            )}
            {!hasRules && (
              <p className="ob-empty-note">
                No sites selected. You can add rules from the dashboard later.
              </p>
            )}
            <div className="ob-field">
              <label className="ob-field-label">Reset window</label>
              <div className="seg">
                {INTERVAL_OPTIONS.map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    className={`seg__option${intervalHours === hours ? " seg__option--active" : ""}`}
                    aria-pressed={intervalHours === hours}
                    onClick={() => setIntervalHours(hours)}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
              <p className="ob-field-hint">Usage counters reset every {intervalHours} hours.</p>
            </div>
            {!validLimits && (
              <p className="ob-error" role="alert">
                Enter a limit from 1 to 1440 minutes.
              </p>
            )}
            <div className="ob-actions">
              <button className="btn btn-ghost btn--sm" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className="btn btn-primary btn--lg ob-primary-action"
                disabled={!validLimits}
                onClick={() => setStep(3)}
              >
                Review →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="ob-title">Review your setup</h1>
            <p className="ob-sub">Your choices will take effect as soon as they are saved.</p>
            <div className="ob-summary">
              {selectedPacks.map((pack) => (
                <div className="ob-summary-item" key={pack.id}>
                  <span className="ob-summary-key">
                    {pack.name} · {assignedCounts[pack.id]} sites
                  </span>
                  <span className="ob-summary-val">
                    {choices[pack.id].mode === "block"
                      ? "Block"
                      : `${choices[pack.id].limitMinutes} min/window`}
                  </span>
                </div>
              ))}
              {customAssignedCount > 0 && (
                <div className="ob-summary-item">
                  <span className="ob-summary-key">My sites · {customAssignedCount} sites</span>
                  <span className="ob-summary-val">
                    {choices[CUSTOM_ID].mode === "block"
                      ? "Block"
                      : `${choices[CUSTOM_ID].limitMinutes} min/window`}
                  </span>
                </div>
              )}
              {!hasRules && (
                <div className="ob-summary-item">
                  <span className="ob-summary-key">Site rules</span>
                  <span className="ob-summary-val">None yet</span>
                </div>
              )}
              <div className="ob-summary-item">
                <span className="ob-summary-key">Reset every</span>
                <span className="ob-summary-val">{intervalHours} hours</span>
              </div>
            </div>
            <p className="ob-field-hint">
              If any selected sites already have rules, those rules stay in place.
            </p>
            {saveError && (
              <p className="ob-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="ob-actions">
              <button
                className="btn btn-ghost btn--sm"
                disabled={saving}
                onClick={() => setStep(2)}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary btn--lg ob-primary-action"
                disabled={saving}
                onClick={() => void handleFinish()}
              >
                {saving ? "Saving…" : "Save setup"}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="ob-title">Setup complete</h1>
            <p className="ob-sub">
              {createdCount > 0
                ? `${createdCount} group${createdCount === 1 ? "" : "s"} ready. Your reset window is saved.`
                : "Your reset window is saved. You can add or edit site rules from the dashboard."}
            </p>
            <div className="ob-actions">
              <button
                className="btn btn-primary btn--lg ob-primary-action"
                onClick={() =>
                  window.location.assign(
                    chrome.runtime.getURL("src/ui/options/options.html") + "#rules",
                  )
                }
              >
                Open dashboard →
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
