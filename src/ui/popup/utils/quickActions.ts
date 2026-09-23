import { domainMatches } from "../../../core/domain";
import { resolveEffectivePolicy } from "../../../core/policy";
import type { Settings, SiteRule } from "../../../core/types";
import { domainSchema } from "../../../core/validation";

export type QuickAction = { mode: "block" } | { mode: "limit"; minutes: number };

export interface QuickActionState {
  domain: string | null;
  canBlock: boolean;
  canSetLimit: boolean;
  editHash: string;
  editLabel: string;
  note: string | null;
}

/** The popup only writes a new, stronger site rule. Existing rules are edited in Settings. */
export function getQuickActionState(settings: Settings, hostname: string): QuickActionState {
  const parsed = domainSchema.safeParse(hostname);
  const domain = parsed.success ? parsed.data : null;
  const policy = domain ? resolveEffectivePolicy(domain, settings) : null;
  const existingSiteRule = domain
    ? settings.siteRules.some(
        (rule) => domainMatches(rule.domain, domain) || domainMatches(domain, rule.domain),
      )
    : false;
  const focusActive =
    settings.allowlistMode.enabled ||
    Boolean(settings.lockedInSession?.active && Date.now() < settings.lockedInSession.endTs);

  let editHash = "#sites";
  let editLabel = "Manage site rules";
  if (policy?.reason === "group") {
    editHash = "#groups";
    editLabel = "Edit group";
  } else if (policy?.reason === "global-block-list" || policy?.reason === "global-defaults") {
    editHash = "#settings";
    editLabel = "Edit default rule";
  } else if (policy?.reason === "site-rule" || existingSiteRule) {
    editLabel = "Edit site rule";
  }

  const note = !domain
    ? "Quick actions are available on regular websites."
    : settings.disabled
      ? "JustDetox is paused. Enable it in Settings to apply rules."
      : focusActive
        ? "Your focus session controls access right now. Manage rules in Settings."
        : existingSiteRule
          ? "A site rule already covers this site or a subdomain. Edit it in Settings."
          : null;

  const canWrite = domain !== null && !settings.disabled && !focusActive && !existingSiteRule;
  return {
    domain,
    canBlock: canWrite && policy?.mode !== "block",
    canSetLimit: canWrite && policy === null,
    editHash,
    editLabel,
    note,
  };
}

export function addQuickRule(settings: Settings, hostname: string, action: QuickAction): Settings {
  const state = getQuickActionState(settings, hostname);
  if (!state.domain) throw new Error("This page cannot have a site rule.");
  if (action.mode === "block" && !state.canBlock) {
    throw new Error("This site has an existing rule. Edit it in Settings.");
  }
  if (action.mode === "limit") {
    if (!state.canSetLimit) {
      throw new Error("This site has an existing rule. Edit it in Settings.");
    }
    if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 1440) {
      throw new Error("Choose a limit between 1 and 1440 minutes.");
    }
  }

  const rule: SiteRule = {
    domain: state.domain,
    mode: action.mode,
    enabled: true,
    ...(action.mode === "limit" ? { limitMinutes: action.minutes } : {}),
  };
  return { ...settings, siteRules: [...settings.siteRules, rule] };
}
