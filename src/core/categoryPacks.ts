// FILE: src/core/categoryPacks.ts
//
// Built-in category pack registry.
//
// Packs are immutable templates — applying a pack copies its domains into user
// settings. Subsequent edits to those settings do NOT mutate the registry.

import { normalizeDomain } from "./domain";
import type { RuleMode } from "./types";

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface CategoryPack {
  /** Stable slug identifier. */
  id: string;
  name: string;
  description?: string;
  /** Pre-normalized domain list (no www., no protocol). */
  domains: string[];
  /** Suggested default mode when applying this pack. */
  defaultMode?: RuleMode;
  /** Suggested time limit in minutes when defaultMode is "limit". */
  suggestedLimitMinutes?: number;
}

// ─── Raw registry (pre-normalization) ─────────────────────────────────────────

const RAW_PACKS: CategoryPack[] = [
  {
    id: "social-media",
    name: "Social Media",
    description: "The biggest social networks and short-form video platforms.",
    domains: [
      "x.com",
      "twitter.com",
      "instagram.com",
      "facebook.com",
      "tiktok.com",
      "snapchat.com",
      "reddit.com",
      "linkedin.com",
      "pinterest.com",
    ],
    defaultMode: "block",
  },
  {
    id: "video-streaming",
    name: "Video & Streaming",
    description: "On-demand video, live streaming, and VOD platforms.",
    domains: [
      "youtube.com",
      "netflix.com",
      "hulu.com",
      "twitch.tv",
      "disneyplus.com",
      "primevideo.com",
      "max.com",
    ],
    defaultMode: "block",
  },
  {
    id: "news-forums",
    name: "News & Forums",
    description: "News outlets and community discussion platforms.",
    domains: [
      "news.ycombinator.com",
      "cnn.com",
      "foxnews.com",
      "nytimes.com",
      "washingtonpost.com",
      "quora.com",
      "reddit.com",
    ],
    defaultMode: "limit",
    suggestedLimitMinutes: 20,
  },
  {
    id: "shopping",
    name: "Shopping",
    description: "E-commerce and retail marketplaces.",
    domains: [
      "amazon.com",
      "ebay.com",
      "walmart.com",
      "target.com",
      "etsy.com",
      "aliexpress.com",
    ],
    defaultMode: "block",
  },
  {
    id: "gaming",
    name: "Gaming",
    description: "Game storefronts, platforms, and gaming news.",
    domains: [
      "steampowered.com",
      "store.steampowered.com",
      "epicgames.com",
      "xbox.com",
      "playstation.com",
      "ign.com",
    ],
    defaultMode: "block",
  },
  {
    id: "messaging",
    name: "Messaging",
    description: "Web-based chat and messaging applications.",
    domains: [
      "web.whatsapp.com",
      "discord.com",
      "messenger.com",
      "web.telegram.org",
      "slack.com",
    ],
    defaultMode: "limit",
    suggestedLimitMinutes: 30,
  },
  {
    id: "ai-chat",
    name: "AI / Chat Apps",
    description: "AI assistants and generative chat platforms.",
    domains: [
      "chatgpt.com",
      "claude.ai",
      "gemini.google.com",
      "perplexity.ai",
      "character.ai",
    ],
    defaultMode: "limit",
    suggestedLimitMinutes: 30,
  },
];

// ─── Normalized registry ───────────────────────────────────────────────────────

/**
 * Normalize every domain at module-load time and deduplicate within each pack.
 * This is the single source of truth — never mutate this array.
 */
const CATEGORY_PACKS: CategoryPack[] = RAW_PACKS.map((pack) => ({
  ...pack,
  domains: [...new Set(pack.domains.map(normalizeDomain))].filter(Boolean),
}));

// ─── Public helpers ────────────────────────────────────────────────────────────

/** Returns a copy of all built-in category packs. */
export function getAllCategoryPacks(): CategoryPack[] {
  return CATEGORY_PACKS;
}

/** Returns a pack by its id, or `undefined` if not found. */
export function getCategoryPackById(id: string): CategoryPack | undefined {
  return CATEGORY_PACKS.find((p) => p.id === id);
}

/**
 * Filter packs whose name or domains contain `query` (case-insensitive).
 * An empty/whitespace-only query returns all packs.
 */
export function searchCategoryPacks(query: string): CategoryPack[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATEGORY_PACKS;
  return CATEGORY_PACKS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.domains.some((d) => d.includes(q)),
  );
}
