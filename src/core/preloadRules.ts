import { computeBlockedState } from "./policy";
import type { Settings, UsageMap } from "./types";

/** Reserved for JustDetox's generated dynamic DNR rules. */
export const PRELOAD_RULE_ID_START = 20_000;
// Chrome allows 1,000 dynamic regex rules. Leave headroom for future rules.
export const PRELOAD_RULE_ID_END = 20_899;
const FRAME_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  "main_frame" as chrome.declarativeNetRequest.ResourceType,
  "sub_frame" as chrome.declarativeNetRequest.ResourceType,
];
const REDIRECT = "redirect" as chrome.declarativeNetRequest.RuleActionType;
const ALLOW = "allow" as chrome.declarativeNetRequest.RuleActionType;
const HOST_REGEX = "^https?://([^/?#:]+).*";

function redirectAction(blockedPageUrl: string): chrome.declarativeNetRequest.RuleAction {
  return { type: REDIRECT,
    redirect: { regexSubstitution: `${blockedPageUrl}?host=\\1` } };
}

function candidateDomains(settings: Settings, usage: UsageMap, at: number): string[] {
  return [...new Set([
    ...settings.siteRules.filter((rule) => rule.enabled).map((rule) => rule.domain),
    ...settings.groups.filter((group) => group.enabled).flatMap((group) => group.domains),
    ...settings.globalBlockList,
    ...Object.keys(usage),
    ...(settings.allowlistMode.enabled ? settings.allowlistMode.allowedDomains : []),
    ...(settings.lockedInSession?.active && at < settings.lockedInSession.endTs
      ? settings.lockedInSession.allowedDomains : []),
  ])];
}

/** The next schedule/session/reset boundary that needs a browser-rule refresh. */
export function nextPreloadBoundary(settings: Settings, usage: UsageMap, at = Date.now()): number | undefined {
  const times = candidateDomains(settings, usage, at)
    .map((domain) => computeBlockedState(domain, usage, settings, at).nextCheckTs)
    .filter((time): time is number => time !== undefined && time > at);
  if (settings.lockedInSession?.active && settings.lockedInSession.endTs > at) {
    times.push(settings.lockedInSession.endTs);
  }
  return times.length ? Math.min(...times) : undefined;
}

/** Compile the current policy into browser-level navigation rules. */
export function buildPreloadRules(
  settings: Settings,
  usage: UsageMap,
  at: number,
  blockedPageUrl: string,
): chrome.declarativeNetRequest.Rule[] {
  if (!settings.preloadBlocking || settings.disabled) return [];

  const focusActive = settings.allowlistMode.enabled || Boolean(
    settings.lockedInSession?.active && at < settings.lockedInSession.endTs,
  );
  const catchAll = focusActive || settings.globalDefaults?.mode === "block";
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  let id = PRELOAD_RULE_ID_START;

  if (catchAll) {
    rules.push({
      id: id++, priority: 1,
      action: redirectAction(blockedPageUrl),
      condition: { regexFilter: HOST_REGEX, resourceTypes: FRAME_TYPES },
    });
  }

  // More specific domains must win over a parent rule, irrespective of the
  // order in which rules and groups were created.
  const domains = candidateDomains(settings, usage, at).sort((a, b) =>
    a.split(".").length - b.split(".").length || a.localeCompare(b));
  const decisions = new Map(domains.map((domain) => [
    domain, computeBlockedState(domain, usage, settings, at).blocked,
  ]));
  for (const domain of domains) {
    const blocked = decisions.get(domain) === true;
    const labels = domain.split(".");
    const overridesBlockedParent = labels.some((_, index) =>
      index > 0 && decisions.get(labels.slice(index).join(".")) === true);
    if (!blocked && !catchAll && !overridesBlockedParent) continue;
    if (id > PRELOAD_RULE_ID_END) throw new Error("Too many pre-load rules. Reduce the number of configured domains.");
    const priority = 100 + Math.min(100, domain.split(".").length);
    rules.push({
      id: id++, priority,
      action: blocked
        ? redirectAction(blockedPageUrl)
        : { type: ALLOW },
      condition: { requestDomains: [domain],
        ...(blocked ? { regexFilter: HOST_REGEX } : {}), resourceTypes: FRAME_TYPES },
    });
  }
  return rules;
}
