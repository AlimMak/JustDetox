import { useState } from "react";
import type { SiteGroup, RuleMode } from "../../../core/types";
import { Modal } from "./Modal";
import { DomainPillInput } from "./DomainPillInput";
import { generateId } from "../utils/id";

interface GroupEditorProps {
  group: SiteGroup | null; // null = create new
  onSave: (group: SiteGroup) => void;
  onClose: () => void;
}

interface FormErrors {
  name?: string;
  domains?: string;
  limitMinutes?: string;
}

export function GroupEditor({ group, onSave, onClose }: GroupEditorProps) {
  const isNew = group === null;
  const [name, setName] = useState(group?.name ?? "");
  const [mode, setMode] = useState<RuleMode>(group?.mode ?? "block");
  const [limitMinutes, setLimitMinutes] = useState(String(group?.limitMinutes ?? 30));
  const [domains, setDomains] = useState<string[]>(group?.domains ?? []);
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required";
    if (domains.length === 0) errs.domains = "Add at least one domain";
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

    const saved: SiteGroup = {
      id: group?.id ?? generateId(),
      name: name.trim(),
      mode,
      limitMinutes: mode === "limit" ? parseInt(limitMinutes, 10) : undefined,
      domains,
      enabled,
    };
    onSave(saved);
  };

  return (
    <Modal
      title={isNew ? "New Group" : `Edit "${group!.name}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            {isNew ? "Create" : "Save"}
          </button>
        </>
      }
    >
      {/* Name */}
      <div className="form-row">
        <label className="form-label">
          Group name
          <input
            type="text"
            value={name}
            placeholder="Social Media"
            onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          />
        </label>
        {errors.name && <p className="form-error">{errors.name}</p>}
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
            Shared limit (min)
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

      {/* Domains */}
      <div className="form-row">
        <label className="form-label" style={{ marginBottom: 4 }}>
          Domains
        </label>
        <DomainPillInput
          domains={domains}
          onChange={(d) => { setDomains(d); setErrors((p) => ({ ...p, domains: undefined })); }}
        />
        {errors.domains && <p className="form-error">{errors.domains}</p>}
      </div>

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
