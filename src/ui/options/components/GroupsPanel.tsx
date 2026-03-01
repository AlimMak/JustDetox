// FILE: src/ui/options/components/GroupsPanel.tsx

import { useState } from "react";
import type { Settings, SiteGroup } from "../../../core/types";
import { GroupEditor } from "./GroupEditor";
import { useFriction } from "../context/FrictionContext";

interface GroupsPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

export function GroupsPanel({ settings, patch }: GroupsPanelProps) {
  const [editing, setEditing] = useState<SiteGroup | null | "new">(null);
  const { askFriction } = useFriction();

  const saveGroup = (saved: SiteGroup) => {
    const exists = settings.groups.some((g) => g.id === saved.id);
    const next = exists
      ? settings.groups.map((g) => (g.id === saved.id ? saved : g))
      : [...settings.groups, saved];
    patch({ groups: next });
    setEditing(null);
  };

  const deleteGroup = async (id: string) => {
    const group = settings.groups.find((g) => g.id === id);
    const ok = await askFriction({
      actionType: "delete-group",
      label: `${group?.name ?? id} — group`,
    });
    if (!ok) return;
    patch({ groups: settings.groups.filter((g) => g.id !== id) });
  };

  const toggleEnabled = async (id: string) => {
    const group = settings.groups.find((g) => g.id === id);
    // Only gate when the group is currently ENABLED (user is disabling it).
    if (group?.enabled) {
      const ok = await askFriction({
        actionType: "disable-group",
        label: `${group.name} — ${group.mode === "block" ? "block" : `${group.limitMinutes ?? 0}min limit`}`,
      });
      if (!ok) return;
    }
    patch({
      groups: settings.groups.map((g) =>
        g.id === id ? { ...g, enabled: !g.enabled } : g,
      ),
    });
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Groups</h1>
          <p className="panel-subtitle">
            Group related domains and apply a shared block or time limit.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          + New group
        </button>
      </div>

      {settings.groups.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__heading">No groups yet.</p>
          <p className="empty-state__body">
            Create a group to block multiple sites together.
          </p>
        </div>
      ) : (
        <div className="rule-card-list">
          {settings.groups.map((g) => (
            <div
              key={g.id}
              className={`list-row list-row--interactive${g.enabled ? "" : " list-row--disabled"}`}
            >
              <div className="list-row__main">
                <span className="list-row__title">{g.name}</span>
                <span className="list-row__sub">
                  {g.mode === "block"
                    ? "Block"
                    : `${g.limitMinutes ?? 0} min/window`}{" "}
                  · {g.domains.length} domain{g.domains.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="list-row__aside">
                <label
                  className="toggle"
                  title={g.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                >
                  <input
                    className="toggle__input"
                    type="checkbox"
                    checked={g.enabled}
                    onChange={() => void toggleEnabled(g.id)}
                  />
                  <span className="toggle__track"><span className="toggle__thumb" /></span>
                </label>
                <button
                  className="btn btn-ghost btn--sm"
                  onClick={() => setEditing(g)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger btn--sm"
                  onClick={() => void deleteGroup(g.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <GroupEditor
          group={editing === "new" ? null : editing}
          onSave={saveGroup}
          onClose={() => setEditing(null)}
          defaultDelaySeconds={settings.defaultDelaySeconds}
        />
      )}
    </div>
  );
}
