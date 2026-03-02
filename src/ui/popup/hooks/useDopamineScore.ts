import { useEffect, useState } from "react";
import { getDopamineScore } from "../../../core/storage";
import type { DopamineScoreData } from "../../../core/types";
import { DEFAULT_DOPAMINE_SCORE } from "../../../core/types";

/**
 * Reads the current Dopamine Score from storage on mount.
 * Returns the score data and a loading flag.
 */
export function useDopamineScore() {
  const [data, setData] = useState<DopamineScoreData>({
    ...DEFAULT_DOPAMINE_SCORE,
    windowStartTs: Date.now(),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDopamineScore().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  return { data, loading };
}
