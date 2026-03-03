import { useEffect, useState } from "react";
import { getSelfControlData } from "../../../core/storage";

/**
 * Lightweight hook that reads just the total event count from the
 * Self-Control event log. Used by the popup summary row.
 */
export function useSelfControlCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSelfControlData()
      .then((data) => {
        setCount(data.events.length);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { count, loading };
}
