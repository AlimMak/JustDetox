import { useCallback, useEffect, useMemo, useState } from "react";
import { getUsage } from "../../../core/storage";
import { sumUsageUnder } from "../../../core/match";
import type { Settings, UsageMap } from "../../../core/types";

export interface DomainStat {
  hostname: string;
  activeSeconds: number;
}

export interface GroupStat {
  groupId: string;
  name: string;
  activeSeconds: number;
  domainCount: number;
  mode: Settings["groups"][number]["mode"];
}

/**
 * Loads usage from storage and derives per-domain and per-group stats.
 *
 * Accepts `settings` from the parent so only one settings read is needed
 * (the parent's useSettings hook already holds it).
 *
 * Call `refresh()` to re-read usage from storage (e.g. after clicking Refresh).
 */
export function useDashboard(settings: Settings) {
  const [usage, setUsage] = useState<UsageMap>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const u = await getUsage();
    setUsage(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Top 10 domains by active seconds, descending. Only non-zero entries. */
  const domainStats = useMemo((): DomainStat[] => {
    return Object.entries(usage)
      .filter(([, u]) => u.activeSeconds > 0)
      .map(([hostname, u]) => ({ hostname, activeSeconds: u.activeSeconds }))
      .sort((a, b) => b.activeSeconds - a.activeSeconds)
      .slice(0, 10);
  }, [usage]);

  /**
   * One entry per group that has any recorded usage.
   * Uses sumUsageUnder so subdomain visits (m.twitter.com) count against
   * the parent domain's group pool, consistent with policy.ts.
   */
  const groupStats = useMemo((): GroupStat[] => {
    return settings.groups
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        domainCount: g.domains.length,
        mode: g.mode,
        activeSeconds: g.domains.reduce(
          (sum, d) => sum + sumUsageUnder(d, usage),
          0,
        ),
      }))
      .filter((g) => g.activeSeconds > 0)
      .sort((a, b) => b.activeSeconds - a.activeSeconds);
  }, [settings.groups, usage]);

  /** Total seconds tracked across all domains in the current window. */
  const totalSeconds = useMemo(() => {
    return domainStats.reduce((s, d) => s + d.activeSeconds, 0);
  }, [domainStats]);

  return { domainStats, groupStats, totalSeconds, loading, refresh: load };
}
