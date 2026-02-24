export type Section =
  | "dashboard"
  | "settings"
  | "groups"
  | "sites"
  | "import-export"
  | "about";

const VALID_SECTIONS: Section[] = [
  "dashboard",
  "settings",
  "groups",
  "sites",
  "import-export",
  "about",
];

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◎" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "groups", label: "Groups", icon: "⊞" },
  { id: "sites", label: "Sites", icon: "⊕" },
  { id: "import-export", label: "Import / Export", icon: "⇅" },
  { id: "about", label: "About", icon: "ℹ" },
];

interface SidebarProps {
  active: Section;
  onSelect: (s: Section) => void;
  extensionDisabled: boolean;
}

export function Sidebar({ active, onSelect, extensionDisabled }: SidebarProps) {
  return (
    <nav className="options-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">JustDetox</span>
        <span
          className={`sidebar-status ${extensionDisabled ? "sidebar-status--off" : "sidebar-status--on"}`}
        >
          {extensionDisabled ? "Disabled" : "Active"}
        </span>
      </div>

      <ul className="sidebar-nav" role="list">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <li key={id}>
            <button
              className={`sidebar-nav-item${active === id ? " active" : ""}`}
              onClick={() => onSelect(id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Resolve the initial section from location.hash, defaulting to "dashboard". */
export function resolveInitialSection(): Section {
  const hash = location.hash.slice(1) as Section;
  return VALID_SECTIONS.includes(hash) ? hash : "dashboard";
}
