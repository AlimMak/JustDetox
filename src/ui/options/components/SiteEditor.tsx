import { useState } from "react";
import type { SiteRule, RuleMode } from "../../../core/types";
import { sanitizeDomain, isValidDomain } from "../../../core/validation";
import { Modal } from "./Modal";

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

  const handleSave = () => {
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
    onSave(saved);
  };

  return (
    <Modal
      title={isNew ? "New Site Rule" : `Edit "${rule!.domain}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            {isNew ? "Add rule" : "Save"}
          </button>
        </>
      }
    >
      {/* Domain */}
      <div className="form-row">
        <label className="form-label">
          Domain
          <input
            type="text"
            value={domain}
            placeholder="twitter.com"
            disabled={!isNew}
            onChange={(e) => { setDomain(e.target.value); setErrors((p) => ({ ...p, domain: undefined })); }}
          />
        </label>
        {errors.domain && <p className="form-error">{errors.domain}</p>}
      </div>

      {/* Mode */}
      <div className="form-row form-row--split">
        <label className="form-label">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as RuleMode)}>
            <option value="block">Block entirely</option>
            <option value="limit">Time limit</option>
          </select>
        </label>
        {mode === "limit" && (
          <label className="form-label">
            Limit (min / window)
            <input
              type="number"
              min={1}
              max={1440}
              value={limitMinutes}
              onChange={(e) => { setLimitMinutes(e.target.value); setErrors((p) => ({ ...p, limitMinutes: undefined })); }}
            />
          </label>
        )}
      </div>
      {errors.limitMinutes && <p className="form-error">{errors.limitMinutes}</p>}

      {/* Enabled */}
      <label className="toggle-row">
        <span className="form-label" style={{ marginBottom: 0 }}>Rule enabled</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ accentColor: "#fff" }}
        />
      </label>
    </Modal>
  );
}
