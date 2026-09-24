import { useMemo, useState } from "react";
import { computeBlockedState, type BlockedState } from "../../../core/policy";
import { getUsage } from "../../../core/storage";
import type { Settings, UsageMap } from "../../../core/types";
import { domainSchema } from "../../../core/validation";
import { formatTime } from "../../popup/utils/formatTime";

function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
}

export function RulePreviewPanel({ settings }: { settings: Settings }) {
  const [site, setSite] = useState("");
  const [when, setWhen] = useState(() => localDateTime(new Date()));
  const [usage, setUsage] = useState<UsageMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!usage) return null;
    const parsed = domainSchema.safeParse(site);
    const at = new Date(when).getTime();
    if (!parsed.success || !Number.isFinite(at)) return null;
    const state: BlockedState = settings.disabled
      ? { blocked: false, source: "JustDetox is disabled" }
      : computeBlockedState(parsed.data, usage, settings, at);
    return {
      domain: parsed.data,
      state,
    };
  }, [site, when, usage, settings]);

  const runPreview = async () => {
    if (!domainSchema.safeParse(site).success) {
      setError("Enter a valid website or domain, such as youtube.com.");
      return;
    }
    const at = new Date(when).getTime();
    if (!Number.isFinite(at) || at < Date.now() - 60_000 || at > Date.now() + 7 * 86_400_000) {
      setError("Choose a time between now and seven days from now.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setUsage(await getUsage());
    } catch {
      setError("Could not load current usage. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Rule preview</h1>
          <p className="panel-subtitle">See what JustDetox would do before you open a site.</p>
        </div>
      </div>
      <section className="panel-section">
        <div className="field">
          <label className="field__label" htmlFor="preview-site">Website</label>
          <input id="preview-site" className="input" value={site}
            placeholder="youtube.com or https://youtube.com/watch"
            onChange={(event) => setSite(event.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 260, marginTop: "var(--sp-4)" }}>
          <label className="field__label" htmlFor="preview-when">At this time</label>
          <input id="preview-when" className="input" type="datetime-local" value={when}
            onChange={(event) => setWhen(event.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ marginTop: "var(--sp-4)" }}
          disabled={loading} onClick={() => void runPreview()}>
          {loading ? "Checking…" : "Preview rule"}
        </button>
        {error && <p className="field__error" role="alert">{error}</p>}
      </section>

      {preview && !error && (
        <section className="panel-section" aria-live="polite">
          <p className="section-heading">{preview.domain}</p>
          <p style={{ fontSize: "var(--text-lg)", marginBottom: "var(--sp-2)" }}>
            {preview.state.blocked ? "Blocked" : preview.state.delayed ? "Delay first" : "Allowed"}
          </p>
          {preview.state.source && <p className="field__hint">Rule: {preview.state.source}</p>}
          {preview.state.message && <p className="field__hint">{preview.state.message}</p>}
          {preview.state.remainingSeconds !== undefined && (
            <p className="field__hint">Time remaining: {formatTime(preview.state.remainingSeconds)}</p>
          )}
          {preview.state.delaySeconds && (
            <p className="field__hint">Delay: {preview.state.delaySeconds} seconds</p>
          )}
          {preview.state.nextCheckTs && (
            <p className="field__hint">Next change: {new Date(preview.state.nextCheckTs).toLocaleString()}</p>
          )}
          <p className="field__hint" style={{ marginTop: "var(--sp-3)" }}>
            This uses your current usage. Time you spend browsing before the chosen time may change the result.
          </p>
        </section>
      )}
    </div>
  );
}
