// FILE: src/ui/options/components/Sidebar.tsx

export type Section =
  | "rules"
  | "settings"
  | "groups"
  | "sites"
  | "reset-window"
  | "import-export"
  | "about";

const VALID_SECTIONS: Section[] = [
  "rules",
  "settings",
  "groups",
  "sites",
  "reset-window",
  "import-export",
  "about",
];

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "rules",         label: "Rules" },
  { id: "groups",        label: "Groups" },
  { id: "sites",         label: "Sites" },
  { id: "settings",      label: "Settings" },
  { id: "reset-window",  label: "Reset Window" },
  { id: "import-export", label: "Import / Export" },
  { id: "about",         label: "About" },
];

interface SidebarProps {
  active: Section;
  onSelect: (s: Section) => void;
  extensionDisabled: boolean;
}

export function Sidebar({ active, onSelect, extensionDisabled }: SidebarProps) {
  return (
    <nav className="options-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo label-xs">JustDetox</span>
        <span
          className={`sidebar-status ${extensionDisabled ? "sidebar-status--off" : "sidebar-status--on"}`}
        >
          {extensionDisabled ? "Disabled" : "Active"}
        </span>
      </div>

      <ul className="sidebar-nav" role="list">
        {NAV_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <button
              className={`sidebar-nav-item${active === id ? " active" : ""}`}
              onClick={() => onSelect(id)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>v0.1.0</span>
      </div>
    </nav>
  );
}

/** Resolve the initial section from location.hash, defaulting to "rules". */
export function resolveInitialSection(): Section {
  const hash = location.hash.slice(1) as Section;
  return VALID_SECTIONS.includes(hash) ? hash : "rules";
}
