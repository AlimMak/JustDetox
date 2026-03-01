// FILE: src/ui/options/components/GroupEditor.tsx

import { useState } from "react";
import type { SiteGroup, RuleMode } from "../../../core/types";
import { Modal } from "./Modal";
import { DomainPillInput } from "./DomainPillInput";
import { generateId } from "../utils/id";
import { useFriction } from "../context/FrictionContext";

interface GroupEditorProps {
  group: SiteGroup | null; // null = create new
  onSave: (group: SiteGroup) => void;
  onClose: () => void;
  /** Global default delay seconds (used as initial value for new groups). */
  defaultDelaySeconds?: number;
}

interface FormErrors {
  name?: string;
  domains?: string;
  limitMinutes?: string;
  delaySeconds?: string;
}

export function GroupEditor({ group, onSave, onClose, defaultDelaySeconds = 15 }: GroupEditorProps) {
  const isNew = group === null;
  const [name, setName] = useState(group?.name ?? "");
  const [mode, setMode] = useState<RuleMode>(group?.mode ?? "block");
  const [limitMinutes, setLimitMinutes] = useState(String(group?.limitMinutes ?? 30));
  const [domains, setDomains] = useState<string[]>(group?.domains ?? []);
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [delayEnabled, setDelayEnabled] = useState(group?.delayEnabled ?? false);
  const [delaySeconds, setDelaySeconds] = useState(String(group?.delaySeconds ?? defaultDelaySeconds));
  const [errors, setErrors] = useState<FormErrors>({});
  const { askFriction } = useFriction();

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Name is required";
    if (domains.length === 0) errs.domains = "Add at least one domain";
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

    const saved: SiteGroup = {
      id: group?.id ?? generateId(),
      name: name.trim(),
      mode,
      limitMinutes: mode === "limit" ? parseInt(limitMinutes, 10) : undefined,
      domains,
      enabled,
      delayEnabled: mode === "limit" && delayEnabled ? true : undefined,
      delaySeconds: mode === "limit" && delayEnabled ? parseInt(delaySeconds, 10) : undefined,
    };

    // Gate checks only apply when editing an existing group, not creating.
    if (!isNew && group !== null) {
      const wasBlock = group.mode === "block";
      const newLimitMins = parseInt(limitMinutes, 10);
      const oldLimitMins = group.limitMinutes ?? 0;

      // Domain removal: detect domains present in the original but missing now.
      const removedDomains = group.domains.filter((d) => !domains.includes(d));
      if (removedDomains.length > 0) {
        const ok = await askFriction({
          actionType: "remove-domain",
          label: `${saved.name} — remove ${removedDomains.join(", ")}`,
        });
        if (!ok) return;
      }

      if (wasBlock && mode === "limit") {
        const ok = await askFriction({
          actionType: "group-block-to-limit",
          label: `${saved.name} — block → time limit`,
        });
        if (!ok) return;
      } else if (group.mode === "limit" && mode === "limit" && newLimitMins > oldLimitMins) {
        const ok = await askFriction({
          actionType: "group-limit-increase",
          label: `${saved.name} — limit ${oldLimitMins}min → ${newLimitMins}min`,
        });
        if (!ok) return;
      }
    }

    onSave(saved);
  };

  return (
    <Modal
      title={isNew ? "New Group" : `Edit "${group!.name}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void handleSave()}>
            {isNew ? "Create" : "Save"}
          </button>
        </>
      }
    >
      {/* Name */}
      <div className="field">
        <span className="field__label">Group name</span>
        <input
          className="input"
          type="text"
          value={name}
          placeholder="Social Media"
          onChange={(e) => {
            setName(e.target.value);
            setErrors((p) => ({ ...p, name: undefined }));
          }}
        />
        {errors.name && <p className="field__error">{errors.name}</p>}
      </div>

      {/* Mode + limit row */}
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
          <span className="field__label">Shared limit (min/window)</span>
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

      {/* Domains */}
      <div className="field">
        <span className="field__label">Domains</span>
        <DomainPillInput
          domains={domains}
          onChange={(d) => {
            setDomains(d);
            setErrors((p) => ({ ...p, domains: undefined }));
          }}
        />
        {errors.domains && <p className="field__error">{errors.domains}</p>}
      </div>

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

      {/* Delay Mode — only available for time-limit groups */}
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
    </Modal>
  );
}
