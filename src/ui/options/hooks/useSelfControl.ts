import { useCallback, useEffect, useMemo, useState } from "react";
import { getSelfControlData } from "../../../core/storage";
import { getBucketedSeries, getTopSpikes, getTopDomains } from "../../../core/selfControl";
import type { SelfControlData } from "../../../core/types";
import { DEFAULT_SELF_CONTROL_DATA } from "../../../core/types";
import type { BucketPoint, SpikeSummary, DomainSummary } from "../../../core/selfControl";

export type BucketSize = 5 | 15 | 30 | 60;

export interface UseSelfControlResult {
  data: SelfControlData;
  bucketMinutes: BucketSize;
  setBucketMinutes: (size: BucketSize) => void;
  buckets: BucketPoint[];
  topSpikes: SpikeSummary[];
  topDomains: DomainSummary[];
  totalEvents: number;
  loading: boolean;
  refresh: () => void;
}

export function useSelfControl(): UseSelfControlResult {
  const [data, setData] = useState<SelfControlData>({
    ...DEFAULT_SELF_CONTROL_DATA,
    windowStartTs: Date.now(),
  });
  const [bucketMinutes, setBucketMinutes] = useState<BucketSize>(15);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getSelfControlData();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(
    () => getBucketedSeries(data, bucketMinutes),
    [data, bucketMinutes],
  );

  const topSpikes = useMemo(() => getTopSpikes(buckets, 3), [buckets]);
  const topDomains = useMemo(() => getTopDomains(data, 5), [data]);
  const totalEvents = data.events.length;

  return {
    data,
    bucketMinutes,
    setBucketMinutes,
    buckets,
    topSpikes,
    topDomains,
    totalEvents,
    loading,
    refresh: load,
  };
}
