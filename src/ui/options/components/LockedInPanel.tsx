// FILE: src/ui/options/components/LockedInPanel.tsx

/**
 * Locked In Mode panel — options page.
 *
 * Two views:
 *   1. Start flow  — shown when no session is active.
 *      Step 1: Duration (15 / 30 / 60 / Custom min)
 *      Step 2: Allowed sites (pick group OR enter domains manually)
 *      Step 3: Summary + confirm
 *
 *   2. Active session view — shown while a session is running.
 *      Displays remaining time (live countdown), allowed domains,
 *      and an "End Session" button.
 */

import { useEffect, useRef, useState } from "react";
import type { Settings, LockedInSession, SiteGroup } from "../../../core/types";
import { sanitizeDomain, isValidDomain } from "../../../core/validation";
import { DomainPillInput } from "./DomainPillInput";
import { formatTime } from "../../popup/utils/formatTime";

interface LockedInPanelProps {
  settings: Settings;
  patch: (update: Partial<Settings>) => void;
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

const DURATION_PRESETS = [15, 30, 60] as const;
type DurationPreset = (typeof DURATION_PRESETS)[number];

// ─── Remaining-time countdown hook ────────────────────────────────────────────

function useRemainingSeconds(endTs: number | null): number {
  const [remaining, setRemaining] = useState<number>(() =>
    endTs ? Math.max(0, Math.floor((endTs - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!endTs) return;
    const tick = () => {
      const r = Math.max(0, Math.floor((endTs - Date.now()) / 1000));
      setRemaining(r);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [endTs]);

  return remaining;
}

// ─── Active session view ──────────────────────────────────────────────────────

interface ActiveSessionViewProps {
  session: LockedInSession;
  settings: Settings;
  onEnd: () => void;
}

function ActiveSessionView({ session, settings, onEnd }: ActiveSessionViewProps) {
  const remaining = useRemainingSeconds(session.endTs);
  const isExpired = remaining === 0;

  const sourceGroup = session.sourceGroupId
    ? settings.groups.find((g) => g.id === session.sourceGroupId)
    : undefined;

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Locked In Mode</h1>
          <p className="panel-subtitle">
            {isExpired
              ? "Your session has ended. Normal rules have resumed."
              : "Your focus session is active. Stay on task."}
          </p>
        </div>
      </div>

      {/* Session status card */}
      <div className={`locked-in-status-card${isExpired ? " locked-in-status-card--expired" : ""}`}>
        <div className="locked-in-status-top">
          <span className={`locked-in-badge${isExpired ? " locked-in-badge--expired" : ""}`}>
            {isExpired ? "Session ended" : "Active"}
          </span>
        </div>

        <div className="locked-in-time-display">
          <span className="locked-in-time-label">
            {isExpired ? "Ran for" : "Remaining"}
          </span>
          <span className="locked-in-time-value">
            {isExpired
              ? formatTime(Math.round((session.endTs - session.startTs) / 1_000))
              : formatTime(remaining)}
          </span>
        </div>

        <div className="locked-in-meta-row">
          <span className="locked-in-meta-label">Started</span>
          <span className="locked-in-meta-value">
            {new Date(session.startTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="locked-in-meta-row">
          <span className="locked-in-meta-label">
            {isExpired ? "Ended" : "Ends"}
          </span>
          <span className="locked-in-meta-value">
            {new Date(session.endTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Allowed domains */}
      <section className="panel-section">
        <p className="section-heading">Allowed during session</p>
        {sourceGroup && (
          <p className="field__hint" style={{ marginBottom: "var(--sp-3)" }}>
            Sourced from group: <strong style={{ color: "var(--text-2)" }}>{sourceGroup.name}</strong>
          </p>
        )}
        <div className="rule-card-list">
          {session.allowedDomains.length === 0 ? (
            <div style={{ padding: "var(--sp-4)", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
              No allowed domains configured.
            </div>
          ) : (
            session.allowedDomains.map((domain) => (
              <div key={domain} className="list-row">
                <span className="list-row__title" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                  {domain}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* End session */}
      {!isExpired && (
        <section className="panel-section">
          <button className="btn btn-danger" onClick={onEnd}>
            End Session
          </button>
          <p className="field__hint" style={{ marginTop: "var(--sp-2)" }}>
            Ending early restores normal rules immediately.
          </p>
        </section>
      )}
    </div>
  );
}

// ─── Start flow ───────────────────────────────────────────────────────────────

interface StartFlowState {
  step: 1 | 2 | 3;
  durationPreset: DurationPreset | "custom";
  customMinutes: string;
  domainSource: "group" | "manual";
  selectedGroupId: string;
  manualDomains: string[];
}

const INITIAL_FLOW: StartFlowState = {
  step: 1,
  durationPreset: 30,
  customMinutes: "",
  domainSource: "group",
  selectedGroupId: "",
  manualDomains: [],
};

interface StartFlowProps {
  settings: Settings;
  onStart: (session: LockedInSession) => void;
}

function StartFlow({ settings, onStart }: StartFlowProps) {
  const [flow, setFlow] = useState<StartFlowState>(INITIAL_FLOW);
  const customRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof StartFlowState>(key: K, val: StartFlowState[K]) =>
    setFlow((prev) => ({ ...prev, [key]: val }));

  // Resolved duration in minutes
  const resolvedMinutes =
    flow.durationPreset === "custom"
      ? parseInt(flow.customMinutes, 10)
      : flow.durationPreset;

  const durationValid =
    flow.durationPreset !== "custom" ||
    (!isNaN(resolvedMinutes) && resolvedMinutes >= 1 && resolvedMinutes <= 1440);

  // Resolved domains
  const resolvedDomains: string[] = (() => {
    if (flow.domainSource === "group" && flow.selectedGroupId) {
      const group = settings.groups.find((g) => g.id === flow.selectedGroupId);
      return group ? [...group.domains] : [];
    }
    return flow.manualDomains;
  })();

  const domainsValid = resolvedDomains.length > 0;

  const canProceedStep1 = durationValid;
  const canProceedStep2 = domainsValid;

  const handleStart = () => {
    if (!durationValid || !domainsValid) return;
    const now = Date.now();
    const session: LockedInSession = {
      active: true,
      startTs: now,
      endTs: now + resolvedMinutes * 60_000,
      allowedDomains: resolvedDomains,
      sourceGroupId:
        flow.domainSource === "group" ? flow.selectedGroupId || undefined : undefined,
    };
    onStart(session);
  };

  const groupsWithDomains = settings.groups.filter((g) => g.domains.length > 0);

  return (
    <div className="panel-content">
      <div className="panel-header">
        <div>
          <h1 className="panel-title">Locked In Mode</h1>
          <p className="panel-subtitle">
            Start a time-bound session where only selected sites are accessible.
          </p>
        </div>
      </div>

      {/* Step progress */}
      <div className="locked-in-steps">
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            className={`locked-in-step-dot${flow.step === n ? " locked-in-step-dot--active" : ""}${flow.step > n ? " locked-in-step-dot--done" : ""}`}
          />
        ))}
        <span className="locked-in-step-label">Step {flow.step} of 3</span>
      </div>

      {/* ── Step 1: Duration ── */}
      {flow.step === 1 && (
        <section className="panel-section">
          <p className="section-heading">Duration</p>

          <div className="seg" style={{ marginBottom: "var(--sp-3)" }}>
            {DURATION_PRESETS.map((p) => (
              <button
                key={p}
                className={`seg__option${flow.durationPreset === p ? " seg__option--active" : ""}`}
                onClick={() => set("durationPreset", p)}
              >
                {p} min
              </button>
            ))}
            <button
              className={`seg__option${flow.durationPreset === "custom" ? " seg__option--active" : ""}`}
              onClick={() => {
                set("durationPreset", "custom");
                setTimeout(() => customRef.current?.focus(), 50);
              }}
            >
              Custom
            </button>
          </div>

          {flow.durationPreset === "custom" && (
            <div className="field" style={{ maxWidth: 200, marginBottom: "var(--sp-3)" }}>
              <span className="field__label">Minutes (1–1440)</span>
              <input
                ref={customRef}
                className="input"
                type="number"
                min={1}
                max={1440}
                placeholder="45"
                value={flow.customMinutes}
                onChange={(e) => set("customMinutes", e.target.value)}
              />
              {flow.customMinutes !== "" && !durationValid && (
                <p className="field__error">Enter a value between 1 and 1440.</p>
              )}
            </div>
          )}

          {durationValid && (
            <p className="field__hint">
              Session will end at{" "}
              {new Date(Date.now() + resolvedMinutes * 60_000).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          )}

          <div style={{ marginTop: "var(--sp-6)" }}>
            <button
              className="btn btn-primary"
              disabled={!canProceedStep1}
              onClick={() => set("step", 2)}
            >
              Next →
            </button>
          </div>
        </section>
      )}

      {/* ── Step 2: Allowed sites ── */}
      {flow.step === 2 && (
        <section className="panel-section">
          <p className="section-heading">Allowed sites</p>
          <p className="field__hint" style={{ marginBottom: "var(--sp-4)" }}>
            Only these domains will be accessible during your session.
            Everything else is blocked.
          </p>

          {/* Source toggle */}
          <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
            <span className="field__label">Domain source</span>
            <div className="seg">
              {groupsWithDomains.length > 0 && (
                <button
                  className={`seg__option${flow.domainSource === "group" ? " seg__option--active" : ""}`}
                  onClick={() => set("domainSource", "group")}
                >
                  From group
                </button>
              )}
              <button
                className={`seg__option${flow.domainSource === "manual" ? " seg__option--active" : ""}`}
                onClick={() => set("domainSource", "manual")}
              >
                Manual
              </button>
            </div>
          </div>

          {/* Group picker */}
          {flow.domainSource === "group" && (
            <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
              <span className="field__label">Select group</span>
              {groupsWithDomains.length === 0 ? (
                <p className="field__hint">No groups with domains found. Use manual entry.</p>
              ) : (
                <div className="select-wrap">
                  <select
                    value={flow.selectedGroupId}
                    onChange={(e) => set("selectedGroupId", e.target.value)}
                  >
                    <option value="">— choose a group —</option>
                    {groupsWithDomains.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.domains.length} domain{g.domains.length !== 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preview selected group domains */}
              {flow.selectedGroupId && (() => {
                const g = settings.groups.find((gr) => gr.id === flow.selectedGroupId);
                if (!g) return null;
                return (
                  <div className="locked-in-domain-preview">
                    {g.domains.map((d) => (
                      <span key={d} className="locked-in-domain-pill">{d}</span>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Manual domain input */}
          {flow.domainSource === "manual" && (
            <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
              <span className="field__label">Domains</span>
              <DomainPillInput
                domains={flow.manualDomains}
                onChange={(domains) => set("manualDomains", domains)}
                placeholder="notion.so, figma.com…"
              />
              <p className="field__hint">Press Enter or comma to add each domain.</p>
            </div>
          )}

          {!domainsValid && (
            <p className="field__error" style={{ marginBottom: "var(--sp-3)" }}>
              Add at least one domain to continue.
            </p>
          )}

          <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
            <button className="btn btn-secondary" onClick={() => set("step", 1)}>
              ← Back
            </button>
            <button
              className="btn btn-primary"
              disabled={!canProceedStep2}
              onClick={() => set("step", 3)}
            >
              Next →
            </button>
          </div>
        </section>
      )}

      {/* ── Step 3: Confirm ── */}
      {flow.step === 3 && (
        <section className="panel-section">
          <p className="section-heading">Confirm session</p>

          <div className="locked-in-summary">
            <div className="locked-in-summary-row">
              <span className="locked-in-summary-label">Duration</span>
              <span className="locked-in-summary-value">{resolvedMinutes} min</span>
            </div>
            <div className="locked-in-summary-row">
              <span className="locked-in-summary-label">Ends at</span>
              <span className="locked-in-summary-value">
                {new Date(Date.now() + resolvedMinutes * 60_000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="locked-in-summary-row">
              <span className="locked-in-summary-label">Allowed sites</span>
              <span className="locked-in-summary-value">{resolvedDomains.length}</span>
            </div>
          </div>

          <div className="locked-in-domain-preview" style={{ marginTop: "var(--sp-3)", marginBottom: "var(--sp-6)" }}>
            {resolvedDomains.map((d) => (
              <span key={d} className="locked-in-domain-pill">{d}</span>
            ))}
          </div>

          <p className="field__hint" style={{ marginBottom: "var(--sp-6)" }}>
            All other domains will show a block overlay until the session ends.
          </p>

          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button className="btn btn-secondary" onClick={() => set("step", 2)}>
              ← Back
            </button>
            <button className="btn btn-primary" onClick={handleStart}>
              Start Session
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Panel root ───────────────────────────────────────────────────────────────

export function LockedInPanel({ settings, patch }: LockedInPanelProps) {
  const session = settings.lockedInSession;
  const isActive = Boolean(session?.active);

  const handleStart = (newSession: LockedInSession) => {
    patch({ lockedInSession: newSession });
  };

  const handleEnd = () => {
    if (!session) return;
    patch({ lockedInSession: { ...session, active: false } });
  };

  if (isActive && session) {
    return (
      <ActiveSessionView
        session={session}
        settings={settings}
        onEnd={handleEnd}
      />
    );
  }

  return <StartFlow settings={settings} onStart={handleStart} />;
}
