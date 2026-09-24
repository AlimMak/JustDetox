// FILE: src/ui/options/components/SettingsPanel.tsx

import { useEffect, useState } from "react";
import type { Settings } from "../../../core/types";
import { DEFAULT_FRICTION_SETTINGS, DEFAULT_PROTECTED_GATE } from "../../../core/types";
import { DomainPillInput } from "./DomainPillInput";
import { useFriction } from "../context/FrictionContext";
import { resolveEffectivePolicy } from "../../../core/policy";

const RESET_PRESETS = [6, 12, 24, 48] as const;

interface SettingsPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, patch }: SettingsPanelProps) {
  const [customHours, setCustomHours] = useState<string>("");
  const [allowlistError, setAllowlistError] = useState<string | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [preloadPermission, setPreloadPermission] = useState<boolean | null>(null);
  const [phraseInput, setPhraseInput] = useState(
    settings.protectedGate?.phrase ?? DEFAULT_PROTECTED_GATE.phrase,
  );
  const { askFriction } = useFriction();

  const pg = settings.protectedGate ?? DEFAULT_PROTECTED_GATE;
  const lockedInActive = Boolean(settings.lockedInSession?.active && Date.now() < settings.lockedInSession.endTs);

  useEffect(() => {
    void chrome.permissions.contains({ origins: ["<all_urls>"] })
      .then(setPreloadPermission).catch(() => setPreloadPermission(false));
  }, []);

  const patchPg = async (partial: Partial<typeof pg>): Promise<boolean> => {
    const next = { ...pg, ...partial };
    const weakening = pg.enabled && (
      !next.enabled ||
      (pg.requireCooldown && !next.requireCooldown) ||
      (pg.requirePhrase && !next.requirePhrase) ||
      (pg.requireCooldown && next.cooldownSeconds < pg.cooldownSeconds) ||
      next.phrase !== pg.phrase
    );
    if (weakening) {
      const ok = await askFriction({
        actionType: "weaken-protected-gate",
        label: "Protected Settings Gate",
      });
      if (!ok) return false;
    }
    patch({ protectedGate: next });
    return true;
  };

  const patchAllowlist = async (enabled: boolean, allowedDomains: string[]) => {
    if (enabled && allowedDomains.length === 0) {
      setAllowlistError("Add at least one allowed domain before enabling Focus Environment.");
      return;
    }
    if (enabled && lockedInActive) {
      setAllowlistError("Wait until Locked In ends before enabling Focus Environment.");
      return;
    }
    setAllowlistError(null);
    const added = allowedDomains.filter((domain) => !settings.allowlistMode.allowedDomains.includes(domain));
    const bypassed = !settings.allowlistMode.enabled && enabled
      ? allowedDomains.filter((domain) => resolveEffectivePolicy(domain, settings) !== null)
      : [];
    if ((settings.allowlistMode.enabled && !enabled) ||
      (settings.allowlistMode.enabled && added.length > 0) || bypassed.length > 0) {
      const ok = await askFriction({
        actionType: settings.allowlistMode.enabled && !enabled
          ? "disable-focus-environment"
          : "weaken-focus-environment",
        label: settings.allowlistMode.enabled && !enabled
          ? "Turn off Focus Environment"
          : `Allow ${[...added, ...bypassed].filter((domain, index, all) => all.indexOf(domain) === index).join(", ")} during Focus Environment`,
        context: [...added, ...bypassed].map((domain) => `Allow access to ${domain}`),
      });
      if (!ok) return;
    }
    patch({ allowlistMode: { enabled, allowedDomains } });
  };

  const patchBlockList = async (list: string[]) => {
    const removed = settings.globalBlockList.filter((domain) => !list.includes(domain));
    if (removed.length > 0) {
      const ok = await askFriction({
        actionType: "remove-always-blocked",
        label: `Remove ${removed.join(", ")} from Always blocked`,
        context: removed.map((domain) => `Unblock ${domain}`),
      });
      if (!ok) return;
    }
    patch({ globalBlockList: list });
  };

  const patchResetWindow = async (hours: number) => {
    if (hours === intervalHours) return;
    if (hours < intervalHours) {
      const ok = await askFriction({
        actionType: "shorten-reset-window",
        label: `Reset usage every ${hours}h instead of ${intervalHours}h`,
      });
      if (!ok) return;
    }
    patch({ resetWindow: { intervalHours: hours } });
  };

  const patchFriction = async (partial: Partial<Settings["friction"]>) => {
    const current = settings.friction ?? DEFAULT_FRICTION_SETTINGS;
    const next = { ...current, ...partial };
    if (current.enabled && ((!next.enabled) || (current.requireReflection && !next.requireReflection))) {
      const ok = await askFriction({
        actionType: "weaken-friction-layer",
        label: !next.enabled ? "Turn off Friction Layer" : "Stop requiring reflection text",
      });
      if (!ok) return;
    }
    patch({ friction: next });
  };

  const patchIdleTracking = async (pauseWhenIdle: boolean) => {
    if (pauseWhenIdle && !settings.pauseWhenIdle) {
      const ok = await askFriction({
        actionType: "pause-tracking-when-idle",
        label: "Pause tracking after five minutes without device input",
      });
      if (!ok) return;
    }
    patch({ pauseWhenIdle });
  };
  const patchPreloadBlocking = async (enabled: boolean) => {
    setPreloadError(null);
    if (!enabled && settings.preloadBlocking) {
      const ok = await askFriction({
        actionType: "disable-preload-blocking",
        label: "Turn off pre-load blocking",
      });
      if (!ok) return;
    }
    if (enabled) {
      try {
        const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
        if (!granted) {
          setPreloadError("Chrome permission was not granted. Pre-load blocking remains off.");
          return;
        }
        setPreloadPermission(true);
      } catch {
        setPreloadError("Could not request Chrome permission. Pre-load blocking remains off.");
        return;
      }
    }
    patch({ preloadBlocking: enabled });
  };
  const { intervalHours } = settings.resetWindow;
  const isCustom = !RESET_PRESETS.includes(intervalHours as (typeof RESET_PRESETS)[number]);

  const applyCustomHours = async () => {
    const h = parseInt(customHours, 10);
    if (h >= 1 && h <= 168) {
      await patchResetWindow(h);
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

      {/* Focus Environment (Allowlist Mode) */}
      <section className="panel-section">
        <p className="section-heading">Focus Environment</p>
        <p className="field__hint" style={{ marginBottom: "var(--sp-4)" }}>
          When active, only the domains you list below are accessible — everything else is blocked. Normal block and limit rules are bypassed.
        </p>
        <p className="field__hint" style={{ marginBottom: "var(--sp-4)" }}>
          Focus Environment takes priority over Locked In. Start or change it after your Locked In session ends.
        </p>

        {/* Enable toggle */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-4)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Enable Allowlist Mode</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Start a strict focus session — only listed sites remain accessible.
            </p>
          </div>
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={settings.allowlistMode.enabled}
              disabled={lockedInActive && !settings.allowlistMode.enabled}
              onChange={(e) => void patchAllowlist(e.target.checked, settings.allowlistMode.allowedDomains)}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Allowed domains list */}
        <div className="field">
          <span className="field__label">Allowed domains</span>
          <DomainPillInput
            domains={settings.allowlistMode.allowedDomains}
            onChange={(list) => void patchAllowlist(settings.allowlistMode.enabled, list)}
            placeholder="github.com, notion.so…"
          />
          {allowlistError && <p className="field__error">{allowlistError}</p>}
          <p className="field__hint">
            Subdomains are included automatically (e.g. adding github.com also allows gist.github.com). Paste URLs — they will be normalized.
          </p>
        </div>
      </section>

      {/* Reset window */}
      <section className="panel-section">
        <p className="section-heading">Reset window</p>

        <div className="seg" style={{ marginBottom: "var(--sp-3)" }}>
          {RESET_PRESETS.map((h) => (
            <button
              key={h}
              className={`seg__option${intervalHours === h ? " seg__option--active" : ""}`}
              onClick={() => void patchResetWindow(h)}
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
              onBlur={() => void applyCustomHours()}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
          </div>
        )}

        <p className="reset-window-hint">
          Usage counters reset every {intervalHours}h. Shortening this window may reset current limits sooner.
        </p>
      </section>

      {/* Pre-load blocking */}
      <section className="panel-section">
        <p className="section-heading">Pre-load blocking</p>
        <div className="field" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Block before sites load</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Optional stronger blocking for page and embedded navigations. Chrome will ask for permission to redirect websites to a JustDetox block page. Rule changes and time limits update as tracking runs.
            </p>
          </div>
          <label className="toggle">
            <input className="toggle__input" type="checkbox" checked={settings.preloadBlocking}
              onChange={(event) => void patchPreloadBlocking(event.target.checked)} />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>
        {preloadError && <p className="field__error" role="alert">{preloadError}</p>}
        {settings.preloadBlocking && preloadPermission === false && (
          <div>
            <p className="field__error">Chrome permission is missing, so pre-load blocking is paused on this device.</p>
            <button className="btn btn-secondary btn--sm" onClick={() => void patchPreloadBlocking(true)}>
              Grant permission
            </button>
          </div>
        )}
      </section>

      {/* Idle tracking */}
      <section className="panel-section">
        <p className="section-heading">Idle tracking</p>
        <div className="field" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Pause after five minutes without input</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              A locked screen always pauses tracking. Turn this on if you also want to pause while the device is idle. Reading or watching a video without input can appear idle.
            </p>
          </div>
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={settings.pauseWhenIdle}
              onChange={(event) => void patchIdleTracking(event.target.checked)}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>
      </section>

      {/* Always blocked */}
      <section className="panel-section">
        <p className="section-heading">Always blocked</p>
        <div className="field">
          <DomainPillInput
            domains={settings.globalBlockList}
            onChange={(list) => void patchBlockList(list)}
            placeholder="reddit.com, tiktok.com…"
          />
          <p className="field__hint">
            Blocks these domains when no matching site or group rule exists. A site rule can override this list.
          </p>
        </div>
      </section>

      {/* Protected Settings Gate */}
      <section className="panel-section">
        <p className="section-heading">Protected Settings Gate</p>
        <p className="field__hint" style={{ marginBottom: "var(--sp-4)" }}>
          Requires a timed cooldown and a typed phrase before any change that weakens your blocking rules.
        </p>

        {/* Enable toggle */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Enable Protected Gate</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Supersedes the Friction Layer for all covered actions.
            </p>
          </div>
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={pg.enabled}
              onChange={(e) => void patchPg({ enabled: e.target.checked })}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Require cooldown toggle */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Require cooldown</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Block &quot;Apply&quot; until the timer reaches zero.
            </p>
          </div>
          <label className={`toggle${!pg.enabled ? " toggle--disabled" : ""}`}>
            <input
              className="toggle__input"
              type="checkbox"
              disabled={!pg.enabled}
              checked={pg.requireCooldown}
              onChange={(e) => void patchPg({ requireCooldown: e.target.checked })}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Cooldown duration */}
        <div className="field" style={{ maxWidth: 240, marginBottom: "var(--sp-3)" }}>
          <span className="field__label">Cooldown duration (seconds)</span>
          <input
            className="input"
            type="number"
            min={15}
            max={300}
            disabled={!pg.enabled || !pg.requireCooldown}
            value={pg.cooldownSeconds}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 15 && v <= 300) void patchPg({ cooldownSeconds: v });
            }}
          />
          <p className="field__hint">15–300 seconds. Default: 60.</p>
        </div>

        {/* Require phrase toggle */}
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}
        >
          <div>
            <span className="field__label" style={{ marginBottom: 0 }}>Require confirmation phrase</span>
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Must type the phrase exactly to apply the change.
            </p>
          </div>
          <label className={`toggle${!pg.enabled ? " toggle--disabled" : ""}`}>
            <input
              className="toggle__input"
              type="checkbox"
              disabled={!pg.enabled}
              checked={pg.requirePhrase}
              onChange={(e) => void patchPg({ requirePhrase: e.target.checked })}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>

        {/* Phrase editor */}
        <div className="field" style={{ maxWidth: 240, marginBottom: "var(--sp-4)" }}>
          <span className="field__label">Confirmation phrase</span>
          <input
            className="input"
            type="text"
            maxLength={20}
            disabled={!pg.enabled || !pg.requirePhrase}
            value={phraseInput}
            onChange={(e) => setPhraseInput(e.target.value)}
            onBlur={() => {
              const trimmed = phraseInput.trim().toUpperCase();
              if (trimmed.length >= 1 && trimmed.length <= 20) {
                void patchPg({ phrase: trimmed }).then((applied) => {
                  if (!applied) setPhraseInput(pg.phrase);
                });
              } else {
                setPhraseInput(pg.phrase);
              }
            }}
          />
          <p className="field__hint">1–20 characters. Saved on blur. Default: LOCK IN.</p>
        </div>

        {/* Test Gate button */}
        <button
          className="btn btn-secondary btn--sm"
          disabled={!pg.enabled}
          onClick={() =>
            void askFriction({
              actionType: "disable-extension",
              label: "Test — no change will be applied",
            })
          }
        >
          Test Gate
        </button>
      </section>

      {/* Friction Layer */}
      <section className="panel-section">
        <p className="section-heading">Behavior</p>

        {/* Default delay seconds */}
        <div className="field" style={{ maxWidth: 200, marginBottom: "var(--sp-4)" }}>
          <span className="field__label">Default delay for new sites (seconds)</span>
          <input
            className="input"
            type="number"
            min={5}
            max={60}
            value={settings.defaultDelaySeconds}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 5 && v <= 60) patch({ defaultDelaySeconds: v });
            }}
          />
          <p className="field__hint">5–60 seconds. Used when enabling Delay Mode on a new site or group.</p>
        </div>

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
              onChange={(e) => void patchFriction({ enabled: e.target.checked })}
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
              onChange={(e) => void patchFriction({ requireReflection: e.target.checked })}
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
              onChange={(e) => void patchFriction({ logReflections: e.target.checked })}
            />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
        </div>
      </section>
    </div>
  );
}
