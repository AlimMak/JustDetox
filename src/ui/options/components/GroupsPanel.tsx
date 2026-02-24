import { useState } from "react";
import type { Settings, SiteGroup } from "../../../core/types";
import { GroupEditor } from "./GroupEditor";

interface GroupsPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

function modeBadge(group: SiteGroup): string {
  if (group.mode === "block") return "Blocked";
  return `${group.limitMinutes ?? 0} min shared`;
}

export function GroupsPanel({ settings, patch }: GroupsPanelProps) {
  const [editing, setEditing] = useState<SiteGroup | null | "new">(null);

  const saveGroup = (saved: SiteGroup) => {
    const exists = settings.groups.some((g) => g.id === saved.id);
    const next = exists
      ? settings.groups.map((g) => (g.id === saved.id ? saved : g))
      : [...settings.groups, saved];
    patch({ groups: next });
    setEditing(null);
  };

  const deleteGroup = (id: string) => {
    patch({ groups: settings.groups.filter((g) => g.id !== id) });
  };

  const toggleEnabled = (id: string) => {
    patch({
      groups: settings.groups.map((g) =>
        g.id === id ? { ...g, enabled: !g.enabled } : g,
      ),
    });
  };

  return (
    <div className="panel-content">
      <div className="panel-title-row">
        <div>
          <h1 className="panel-title">Groups</h1>
          <p className="panel-subtitle">
            Group related domains and apply a shared block or time limit.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + New group
        </button>
      </div>

      {settings.groups.length === 0 ? (
        <div className="empty-state">
          <span>No groups yet.</span>
          <span className="muted">Create a group to block multiple sites together.</span>
        </div>
      ) : (
        <ul className="rule-list" role="list">
          {settings.groups.map((g) => (
            <li key={g.id} className={`rule-card${g.enabled ? "" : " rule-card--disabled"}`}>
              <div className="rule-card__info">
                <span className="rule-card__name">{g.name}</span>
                <span className="rule-card__meta">
                  {modeBadge(g)} · {g.domains.length} domain{g.domains.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="rule-card__actions">
                <button
                  className={`status-dot${g.enabled ? " on" : ""}`}
                  title={g.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  onClick={() => toggleEnabled(g.id)}
                />
                <button className="btn-secondary btn-sm" onClick={() => setEditing(g)}>
                  Edit
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteGroup(g.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <GroupEditor
          group={editing === "new" ? null : editing}
          onSave={saveGroup}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
