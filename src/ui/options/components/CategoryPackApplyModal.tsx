// FILE: src/ui/options/components/CategoryPackApplyModal.tsx

import { useState } from "react";
import type { Settings, SiteGroup, RuleMode } from "../../../core/types";
import type { CategoryPack } from "../../../core/categoryPacks";
import { Modal } from "./Modal";
import { generateId } from "../utils/id";

interface Props {
  pack: CategoryPack;
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
  onClose: () => void;
}

type ApplyTarget = "new-group" | "existing-group";

interface ApplySummary {
  added: number;
  skipped: number;
  groupName: string;
}

export function CategoryPackApplyModal({ pack, settings, patch, onClose }: Props) {
  const [target, setTarget] = useState<ApplyTarget>("new-group");
  const [groupName, setGroupName] = useState(pack.name);
  const [mode, setMode] = useState<RuleMode>(pack.defaultMode ?? "block");
  const [limitMinutes, setLimitMinutes] = useState(
    String(pack.suggestedLimitMinutes ?? 30),
  );
  const [enabled, setEnabled] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState(
    settings.groups[0]?.id ?? "",
  );
  const [nameError, setNameError] = useState("");
  const [limitError, setLimitError] = useState("");
  const [summary, setSummary] = useState<ApplySummary | null>(null);

  const existingGroups = settings.groups;

  const computeResult = (): { added: string[]; skipped: string[] } => {
    if (target === "new-group") {
      return { added: pack.domains, skipped: [] };
    }
    const group = existingGroups.find((g) => g.id === selectedGroupId);
    if (!group) return { added: pack.domains, skipped: [] };
    const existing = new Set(group.domains);
    return {
      added: pack.domains.filter((d) => !existing.has(d)),
      skipped: pack.domains.filter((d) => existing.has(d)),
    };
  };

  const handleApply = () => {
    // Validate
    if (target === "new-group") {
      if (!groupName.trim()) {
        setNameError("Name is required");
        return;
      }
    }
    if (mode === "limit") {
      const mins = parseInt(limitMinutes, 10);
      if (isNaN(mins) || mins < 1 || mins > 1440) {
        setLimitError("Enter a value between 1 and 1440");
        return;
      }
    }

    const { added, skipped } = computeResult();

    if (target === "new-group") {
      const newGroup: SiteGroup = {
        id: generateId(),
        name: groupName.trim(),
        mode,
        limitMinutes: mode === "limit" ? parseInt(limitMinutes, 10) : undefined,
        domains: added,
        enabled,
      };
      patch({ groups: [...settings.groups, newGroup] });
      setSummary({ added: added.length, skipped: skipped.length, groupName: newGroup.name });
    } else {
      const group = existingGroups.find((g) => g.id === selectedGroupId);
      if (!group) return;
      const updated: SiteGroup = {
        ...group,
        domains: [...group.domains, ...added],
      };
      patch({
        groups: settings.groups.map((g) =>
          g.id === selectedGroupId ? updated : g,
        ),
      });
      setSummary({ added: added.length, skipped: skipped.length, groupName: group.name });
    }
  };

  // ── Summary state ──────────────────────────────────────────────────────────
  if (summary !== null) {
    return (
      <Modal
        title="Pack applied"
        onClose={onClose}
        footer={
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <div className="cp-summary">
          <p className="cp-summary__group">{summary.groupName}</p>
          <div className="cp-summary__rows">
            <div className="cp-summary__row">
              <span className="cp-summary__label">Domains added</span>
              <span className="cp-summary__value cp-summary__value--added">
                {summary.added}
              </span>
            </div>
            {summary.skipped > 0 && (
              <div className="cp-summary__row">
                <span className="cp-summary__label">Duplicates skipped</span>
                <span className="cp-summary__value cp-summary__value--skipped">
                  {summary.skipped}
                </span>
              </div>
            )}
          </div>
          {summary.added === 0 && (
            <p className="cp-summary__note">
              All domains from this pack were already in the group.
            </p>
          )}
        </div>
      </Modal>
    );
  }

  // ── Configure state ────────────────────────────────────────────────────────
  return (
    <Modal
      title={`Apply "${pack.name}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            Apply
          </button>
        </>
      }
    >
      {/* Domain preview */}
      <div className="field">
        <span className="field__label">
          {pack.domains.length} domain{pack.domains.length !== 1 ? "s" : ""}
        </span>
        <div className="cp-domain-preview">
          {pack.domains.map((d) => (
            <span key={d} className="cp-domain-pill">
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* Target */}
      <div className="field">
        <span className="field__label">Apply as</span>
        <div className="seg">
          <button
            className={`seg__option${target === "new-group" ? " seg__option--active" : ""}`}
            onClick={() => setTarget("new-group")}
          >
            New group
          </button>
          <button
            className={`seg__option${target === "existing-group" ? " seg__option--active" : ""}${existingGroups.length === 0 ? " seg__option--disabled" : ""}`}
            onClick={() => existingGroups.length > 0 && setTarget("existing-group")}
            title={existingGroups.length === 0 ? "No existing groups" : undefined}
          >
            Add to existing
          </button>
        </div>
      </div>

      {/* New group fields */}
      {target === "new-group" && (
        <>
          <div className="field">
            <span className="field__label">Group name</span>
            <input
              className="input"
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                setNameError("");
              }}
            />
            {nameError && <p className="field__error">{nameError}</p>}
          </div>

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
            <div className="field" style={{ maxWidth: 200 }}>
              <span className="field__label">Limit (min/window)</span>
              <input
                className="input"
                type="number"
                min={1}
                max={1440}
                value={limitMinutes}
                onChange={(e) => {
                  setLimitMinutes(e.target.value);
                  setLimitError("");
                }}
              />
              {limitError && <p className="field__error">{limitError}</p>}
            </div>
          )}

          <div
            className="field"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span className="field__label" style={{ marginBottom: 0 }}>
              Rule active
            </span>
            <label className="toggle">
              <input
                className="toggle__input"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="toggle__track">
                <span className="toggle__thumb" />
              </span>
            </label>
          </div>
        </>
      )}

      {/* Existing group selector */}
      {target === "existing-group" && existingGroups.length > 0 && (
        <div className="field">
          <span className="field__label">Target group</span>
          <div className="select-wrap">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {existingGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.domains.length} domain{g.domains.length !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="field__hint">
            Only new domains from this pack will be added. Duplicates are skipped.
          </p>
        </div>
      )}
    </Modal>
  );
}
