import { useState } from "react";
import type { Settings, SiteRule } from "../../../core/types";
import { SiteEditor } from "./SiteEditor";

interface SitesPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

function ruleBadge(rule: SiteRule): string {
  if (rule.mode === "block") return "Blocked";
  return `${rule.limitMinutes ?? 0} min`;
}

export function SitesPanel({ settings, patch }: SitesPanelProps) {
  const [editing, setEditing] = useState<SiteRule | null | "new">(null);

  const saveRule = (saved: SiteRule) => {
    const exists = settings.siteRules.some((r) => r.domain === saved.domain);
    const next = exists
      ? settings.siteRules.map((r) => (r.domain === saved.domain ? saved : r))
      : [...settings.siteRules, saved];
    patch({ siteRules: next });
    setEditing(null);
  };

  const deleteRule = (domain: string) => {
    patch({ siteRules: settings.siteRules.filter((r) => r.domain !== domain) });
  };

  const toggleEnabled = (domain: string) => {
    patch({
      siteRules: settings.siteRules.map((r) =>
        r.domain === domain ? { ...r, enabled: !r.enabled } : r,
      ),
    });
  };

  return (
    <div className="panel-content">
      <div className="panel-title-row">
        <div>
          <h1 className="panel-title">Sites</h1>
          <p className="panel-subtitle">
            Per-site rules override any group or global setting.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add rule
        </button>
      </div>

      {settings.siteRules.length === 0 ? (
        <div className="empty-state">
          <span>No per-site rules.</span>
          <span className="muted">Add a rule to override group settings for a specific domain.</span>
        </div>
      ) : (
        <ul className="rule-list" role="list">
          {settings.siteRules.map((r) => (
            <li key={r.domain} className={`rule-card${r.enabled ? "" : " rule-card--disabled"}`}>
              <div className="rule-card__info">
                <span className="rule-card__name">{r.domain}</span>
                <span className="rule-card__meta">{ruleBadge(r)}</span>
              </div>
              <div className="rule-card__actions">
                <button
                  className={`status-dot${r.enabled ? " on" : ""}`}
                  title={r.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  onClick={() => toggleEnabled(r.domain)}
                />
                <button className="btn-secondary btn-sm" onClick={() => setEditing(r)}>
                  Edit
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteRule(r.domain)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <SiteEditor
          rule={editing === "new" ? null : editing}
          onSave={saveRule}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
