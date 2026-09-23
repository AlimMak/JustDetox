import { getCategoryPackById } from "../../../core/categoryPacks";
import { domainMatches } from "../../../core/domain";
import type { RuleMode, Settings, SiteGroup } from "../../../core/types";
import { domainSchema } from "../../../core/validation";

export interface SetupChoice {
  packId: string;
  mode: RuleMode;
  limitMinutes: number;
}

export interface RuleChoice {
  mode: RuleMode;
  limitMinutes: number;
}

export function parseCustomDomains(input: string): { domains: string[]; error: string | null } {
  const domains: string[] = [];
  for (const entry of input
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    const parsed = domainSchema.safeParse(entry);
    if (!parsed.success) {
      return { domains: [], error: `"${entry}" is not a valid website address.` };
    }
    if (!domains.includes(parsed.data)) domains.push(parsed.data);
  }
  return { domains, error: null };
}

function validChoice(choice: RuleChoice): boolean {
  return (
    choice.mode === "block" ||
    (Number.isInteger(choice.limitMinutes) &&
      choice.limitMinutes >= 1 &&
      choice.limitMinutes <= 1440)
  );
}

/** Create new groups without changing a rule that already governs a domain. */
export function buildOnboardingSettings(
  settings: Settings,
  choices: SetupChoice[],
  customDomains: string[],
  customChoice: RuleChoice,
  intervalHours: number,
  makeId: () => string,
): Settings {
  if (![6, 12, 24, 48].includes(intervalHours)) {
    throw new Error("Choose a valid reset window.");
  }
  const hasExistingProtection =
    settings.siteRules.some((rule) => rule.enabled) ||
    settings.groups.some((group) => group.enabled) ||
    settings.globalBlockList.length > 0 ||
    Boolean(settings.globalDefaults?.mode);
  if (intervalHours < settings.resetWindow.intervalHours && hasExistingProtection) {
    throw new Error(
      "A shorter reset window can loosen existing limits. Change it in Settings to pass the Protected Gate.",
    );
  }
  if (!validChoice(customChoice) || choices.some((choice) => !validChoice(choice))) {
    throw new Error("Choose a limit between 1 and 1440 minutes.");
  }

  // A new group can override a global default, so reject any limit that would
  // make an existing default less restrictive.
  const assertDoesNotWeakenDefault = (choice: RuleChoice) => {
    if (choice.mode !== "limit") return;
    const defaults = settings.globalDefaults;
    if (!defaults) return;
    if (
      defaults.mode === "block" ||
      (defaults.mode === "limit" && choice.limitMinutes > (defaults.limitMinutes ?? 0))
    ) {
      throw new Error("This limit would loosen your existing default rule. Adjust it in Settings.");
    }
  };

  const existingDomains = [
    ...settings.siteRules.map((rule) => rule.domain),
    ...settings.groups.flatMap((group) => group.domains),
    ...settings.globalBlockList,
  ];
  const newDomains: string[] = [];
  const groups: SiteGroup[] = [];

  const addGroup = (name: string, domains: string[], choice: RuleChoice) => {
    if (domains.length === 0) return;
    const fresh = domains.filter((domain) => {
      if (
        existingDomains.some(
          (existing) => domainMatches(existing, domain) || domainMatches(domain, existing),
        )
      )
        return false;
      if (newDomains.some((existing) => existing === domain)) return false;
      newDomains.push(domain);
      return true;
    });
    if (fresh.length === 0) return;
    assertDoesNotWeakenDefault(choice);
    groups.push({
      id: makeId(),
      name,
      domains: fresh,
      mode: choice.mode,
      limitMinutes: choice.mode === "limit" ? choice.limitMinutes : undefined,
      enabled: true,
    });
  };

  for (const choice of choices) {
    const pack = getCategoryPackById(choice.packId);
    if (!pack) throw new Error("A selected category is no longer available.");
    addGroup(pack.name, pack.domains, choice);
  }
  addGroup("My sites", customDomains, customChoice);

  return {
    ...settings,
    resetWindow: { intervalHours },
    groups: [...settings.groups, ...groups],
  };
}
