// FILE: src/ui/options/components/SiteEditor.tsx

import { useState } from "react";
import type { SiteRule, RuleMode } from "../../../core/types";
import { sanitizeDomain, isValidDomain } from "../../../core/validation";
import { Modal } from "./Modal";
import { useFriction } from "../context/FrictionContext";

interface SiteEditorProps {
  rule: SiteRule | null; // null = create new
  onSave: (rule: SiteRule) => void;
  onClose: () => void;
  /** Temptation attempts for this domain in the current window. */
  attemptCount?: number;
  /** Global default delay seconds (used as initial value for new rules). */
  defaultDelaySeconds?: number;
}

interface FormErrors {
  domain?: string;
  limitMinutes?: string;
  delaySeconds?: string;
}

export function SiteEditor({ rule, onSave, onClose, attemptCount, defaultDelaySeconds = 15 }: SiteEditorProps) {
  const isNew = rule === null;
  const [domain, setDomain] = useState(rule?.domain ?? "");
  const [mode, setMode] = useState<RuleMode>(rule?.mode ?? "block");
  const [limitMinutes, setLimitMinutes] = useState(String(rule?.limitMinutes ?? 30));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [delayEnabled, setDelayEnabled] = useState(rule?.delayEnabled ?? false);
  const [delaySeconds, setDelaySeconds] = useState(String(rule?.delaySeconds ?? defaultDelaySeconds));
  const [errors, setErrors] = useState<FormErrors>({});
  const { askFriction } = useFriction();

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    const cleaned = sanitizeDomain(domain);
    if (!cleaned || !isValidDomain(cleaned)) {
      errs.domain = "Enter a valid hostname (e.g. twitter.com)";
    }
    if (mode === "limit") {
      const mins = parseInt(limitMinutes, 10);
      if (isNaN(mins) || mins < 1 || mins > 1440)
        errs.limitMinutes = "Enter a value between 1 and 1440";
    }
    if (delayEnabled && mode === "limit") {
      const secs = parseInt(delaySeconds, 10);
      if (isNaN(secs) || secs < 5 || secs > 60)
        errs.delaySeconds = "Enter a value between 5 and 60";
    }
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const saved: SiteRule = {
      domain: sanitizeDomain(domain),
      mode,
      limitMinutes: mode === "limit" ? parseInt(limitMinutes, 10) : undefined,
      enabled,
      delayEnabled: mode === "limit" && delayEnabled ? true : undefined,
      delaySeconds: mode === "limit" && delayEnabled ? parseInt(delaySeconds, 10) : undefined,
    };

    // Friction checks only apply when editing an existing rule, not creating.
    if (!isNew && rule !== null) {
      const wasBlock = rule.mode === "block";
      const newLimitMins = parseInt(limitMinutes, 10);
      const oldLimitMins = rule.limitMinutes ?? 0;

      if (wasBlock && mode === "limit") {
        const ok = await askFriction({
          actionType: "rule-block-to-limit",
          label: `${saved.domain} — block → time limit`,
          domain: saved.domain,
        });
        if (!ok) return;
      } else if (rule.mode === "limit" && mode === "limit" && newLimitMins > oldLimitMins) {
        const ok = await askFriction({
          actionType: "rule-limit-increase",
          label: `${saved.domain} — limit ${oldLimitMins}min → ${newLimitMins}min`,
          domain: saved.domain,
        });
        if (!ok) return;
      }
    }

    onSave(saved);
  };

  return (
    <Modal
      title={isNew ? "New Site Rule" : `Edit "${rule!.domain}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void handleSave()}>
            {isNew ? "Add rule" : "Save"}
          </button>
        </>
      }
    >
      {/* Domain */}
      <div className="field">
        <span className="field__label">Domain</span>
        <input
          className="input"
          type="text"
          value={domain}
          placeholder="twitter.com"
          disabled={!isNew}
          onChange={(e) => {
            setDomain(e.target.value);
            setErrors((p) => ({ ...p, domain: undefined }));
          }}
        />
        {errors.domain && <p className="field__error">{errors.domain}</p>}
      </div>

      {/* Mode */}
      <div className="field">
        <span className="field__label">Mode</span>
        <div className="seg">
          <button
            className={`seg__option${mode === "block" ? " seg__option--active" : ""}`}
            onClick={() => setMode("block")}
          >
            Block
          </button>
          <button
            className={`seg__option${mode === "limit" ? " seg__option--active" : ""}`}
            onClick={() => setMode("limit")}
          >
            Time limit
          </button>
        </div>
      </div>

      {mode === "limit" && (
        <div className="field">
          <span className="field__label">Limit (min/window)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={1440}
            value={limitMinutes}
            onChange={(e) => {
              setLimitMinutes(e.target.value);
              setErrors((p) => ({ ...p, limitMinutes: undefined }));
            }}
          />
          {errors.limitMinutes && (
            <p className="field__error">{errors.limitMinutes}</p>
          )}
        </div>
      )}

      {/* Enabled toggle */}
      <div
        className="field"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <span className="field__label" style={{ marginBottom: 0 }}>Rule active</span>
        <label className="toggle">
          <input
            className="toggle__input"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="toggle__track"><span className="toggle__thumb" /></span>
        </label>
      </div>

      {/* Delay Mode — only available for time-limit rules */}
      <div
        className="field"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <span className="field__label" style={{ marginBottom: 0 }}>
            Enable Delay Mode
          </span>
          {mode !== "limit" && (
            <p className="field__hint" style={{ marginTop: "var(--sp-1)" }}>
              Only available in Time limit mode.
            </p>
          )}
        </div>
        <label className={`toggle${mode !== "limit" ? " toggle--disabled" : ""}`}>
          <input
            className="toggle__input"
            type="checkbox"
            disabled={mode !== "limit"}
            checked={mode === "limit" && delayEnabled}
            onChange={(e) => setDelayEnabled(e.target.checked)}
          />
          <span className="toggle__track"><span className="toggle__thumb" /></span>
        </label>
      </div>

      {mode === "limit" && delayEnabled && (
        <div className="field" style={{ maxWidth: 160 }}>
          <span className="field__label">Delay duration (seconds)</span>
          <input
            className="input"
            type="number"
            min={5}
            max={60}
            value={delaySeconds}
            onChange={(e) => {
              setDelaySeconds(e.target.value);
              setErrors((p) => ({ ...p, delaySeconds: undefined }));
            }}
          />
          <p className="field__hint">5–60 seconds.</p>
          {errors.delaySeconds && (
            <p className="field__error">{errors.delaySeconds}</p>
          )}
        </div>
      )}

      {/* Temptation stat — only shown when editing an existing rule */}
      {!isNew && typeof attemptCount === "number" && (
        <p className="field__hint" style={{ marginTop: "var(--sp-2)" }}>
          {attemptCount === 0
            ? "No blocked attempts recorded this window."
            : `${attemptCount} blocked ${attemptCount === 1 ? "attempt" : "attempts"} this window.`}
        </p>
      )}
    </Modal>
  );
}
