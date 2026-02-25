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
}

interface FormErrors {
  domain?: string;
  limitMinutes?: string;
}

export function SiteEditor({ rule, onSave, onClose }: SiteEditorProps) {
  const isNew = rule === null;
  const [domain, setDomain] = useState(rule?.domain ?? "");
  const [mode, setMode] = useState<RuleMode>(rule?.mode ?? "block");
  const [limitMinutes, setLimitMinutes] = useState(String(rule?.limitMinutes ?? 30));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
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
    </Modal>
  );
}
