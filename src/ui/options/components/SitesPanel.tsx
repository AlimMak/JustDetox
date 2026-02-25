// FILE: src/ui/options/components/SitesPanel.tsx

import { useState } from "react";
import type { Settings, SiteRule } from "../../../core/types";
import { SiteEditor } from "./SiteEditor";
import { useFriction } from "../context/FrictionContext";

interface SitesPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

export function SitesPanel({ settings, patch }: SitesPanelProps) {
  const [editing, setEditing] = useState<SiteRule | null | "new">(null);
  const [search, setSearch] = useState("");
  const { askFriction } = useFriction();

  const saveRule = (saved: SiteRule) => {
    const exists = settings.siteRules.some((r) => r.domain === saved.domain);
    const next = exists
      ? settings.siteRules.map((r) => (r.domain === saved.domain ? saved : r))
      : [...settings.siteRules, saved];
    patch({ siteRules: next });
    setEditing(null);
  };

  const deleteRule = async (domain: string) => {
    const ok = await askFriction({
      actionType: "delete-site-rule",
      label: `${domain} — site rule`,
      domain,
    });
    if (!ok) return;
    patch({ siteRules: settings.siteRules.filter((r) => r.domain !== domain) });
  };

  const toggleEnabled = async (domain: string) => {
    const rule = settings.siteRules.find((r) => r.domain === domain);
    // Only gate when the rule is currently ENABLED (user is disabling it).
    if (rule?.enabled) {
      const ok = await askFriction({
        actionType: "disable-site-rule",
        label: `${domain} — ${rule.mode === "block" ? "block" : `${rule.limitMinutes ?? 0}min limit`}`,
        domain,
      });
      if (!ok) return;
    }
    patch({
      siteRules: settings.siteRules.map((r) =>
        r.domain === domain ? { ...r, enabled: !r.enabled } : r,
      ),
    });
  };

  const filtered = settings.siteRules.filter((r) =>
    r.domain.includes(search.toLowerCase()),
  );

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Sites</h1>
          <p className="panel-subtitle">
            Per-site rules override any group or global setting.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          + Add rule
        </button>
      </div>

      {settings.siteRules.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__heading">No per-site rules.</p>
          <p className="empty-state__body">
            Add a rule to override group settings for a specific domain.
          </p>
        </div>
      ) : (
        <>
          <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
            <input
              className="input"
              type="text"
              placeholder="Filter by domain…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__heading">No rules match your search.</p>
            </div>
          ) : (
            <div className="rule-card-list">
              {filtered.map((r) => (
                <div
                  key={r.domain}
                  className={`list-row list-row--interactive${r.enabled ? "" : " list-row--disabled"}`}
                >
                  <div className="list-row__main">
                    <span className="list-row__title">{r.domain}</span>
                    <span className="list-row__sub">
                      {r.mode === "block" ? "Block" : `${r.limitMinutes ?? 0} min/window`}
                    </span>
                  </div>
                  <div className="list-row__aside">
                    <label
                      className="toggle"
                      title={r.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                    >
                      <input
                        className="toggle__input"
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => void toggleEnabled(r.domain)}
                      />
                      <span className="toggle__track"><span className="toggle__thumb" /></span>
                    </label>
                    <button
                      className="btn btn-ghost btn--sm"
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn--sm"
                      onClick={() => void deleteRule(r.domain)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
