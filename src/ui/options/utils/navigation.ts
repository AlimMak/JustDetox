import type { Section } from "../components/Sidebar";

const VALID_SECTIONS: Section[] = [
  "rules", "preview", "locked-in", "settings", "groups", "sites", "packs",
  "reset-window", "import-export", "about",
];

/** Resolve the initial section from location.hash, defaulting to Rules. */
export function resolveInitialSection(): Section {
  const hash = location.hash.slice(1) as Section;
  return VALID_SECTIONS.includes(hash) ? hash : "rules";
}
