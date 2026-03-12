// FILE: src/ui/options/components/CategoryPacksPanel.tsx

import { useState } from "react";
import type { Settings } from "../../../core/types";
import {
  searchCategoryPacks,
  type CategoryPack,
} from "../../../core/categoryPacks";
import { CategoryPackApplyModal } from "./CategoryPackApplyModal";

interface Props {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

export function CategoryPacksPanel({ settings, patch }: Props) {
  const [query, setQuery] = useState("");
  const [applyingPack, setApplyingPack] = useState<CategoryPack | null>(null);

  const packs = searchCategoryPacks(query);

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Category Packs</h1>
          <p className="panel-subtitle">
            Quickly apply curated domain sets as blocked or limited groups.
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <input
          className="input"
          type="search"
          placeholder="Search packs or domains…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Pack cards */}
      {packs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__heading">No matching packs.</p>
          <p className="empty-state__body">Try a different search term.</p>
        </div>
      ) : (
        <div className="cp-grid">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onApply={() => setApplyingPack(pack)}
            />
          ))}
        </div>
      )}

      {applyingPack !== null && (
        <CategoryPackApplyModal
          pack={applyingPack}
          settings={settings}
          patch={patch}
          onClose={() => setApplyingPack(null)}
        />
      )}
    </div>
  );
}

// ─── PackCard ─────────────────────────────────────────────────────────────────

interface PackCardProps {
  pack: CategoryPack;
  onApply: () => void;
}

const PREVIEW_COUNT = 4;

function PackCard({ pack, onApply }: PackCardProps) {
  const preview = pack.domains.slice(0, PREVIEW_COUNT);
  const overflow = pack.domains.length - PREVIEW_COUNT;

  return (
    <div className="cp-card">
      <div className="cp-card__header">
        <span className="cp-card__name">{pack.name}</span>
        <span className="cp-card__count">
          {pack.domains.length} domain{pack.domains.length !== 1 ? "s" : ""}
        </span>
      </div>

      {pack.description && (
        <p className="cp-card__desc">{pack.description}</p>
      )}

      <div className="cp-card__preview">
        {preview.map((d) => (
          <span key={d} className="cp-domain-pill">
            {d}
          </span>
        ))}
        {overflow > 0 && (
          <span className="cp-domain-pill cp-domain-pill--more">
            +{overflow} more
          </span>
        )}
      </div>

      <div className="cp-card__footer">
        <span className="badge">
          {pack.defaultMode === "limit"
            ? `Limit · ${pack.suggestedLimitMinutes ?? 30} min`
            : "Block"}
        </span>
        <button className="btn btn-primary btn--sm" onClick={onApply}>
          Apply
        </button>
      </div>
    </div>
  );
}
