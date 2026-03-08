// FILE: src/ui/options/components/ScheduleEditor.tsx

import type { ScheduleWindow } from "../../../core/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScheduleEditorProps {
  schedules: ScheduleWindow[];
  onChange: (schedules: ScheduleWindow[]) => void;
  /** Optional error message shown at the bottom of the section. */
  error?: string;
}

// ─── Time conversion helpers ──────────────────────────────────────────────────

/** Convert minutes-since-midnight to an HTML time input value: "09:00". */
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Convert an HTML time input value ("09:00") to minutes-since-midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MAX_WINDOWS = 4;

const DEFAULT_WINDOW: ScheduleWindow = {
  enabled: true,
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startMinutes: 540,       // 9:00 AM
  endMinutes: 1020,        // 5:00 PM
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleEditor({ schedules, onChange, error }: ScheduleEditorProps) {
  const isScheduled = schedules.length > 0;

  const handleToggleMode = () => {
    if (isScheduled) {
      onChange([]);
    } else {
      onChange([{ ...DEFAULT_WINDOW }]);
    }
  };

  const updateWindow = (index: number, patch: Partial<ScheduleWindow>) => {
    onChange(schedules.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  };

  const removeWindow = (index: number) => {
    onChange(schedules.filter((_, i) => i !== index));
  };

  const addWindow = () => {
    if (schedules.length >= MAX_WINDOWS) return;
    onChange([...schedules, { ...DEFAULT_WINDOW }]);
  };

  const toggleDay = (windowIndex: number, day: number) => {
    const w = schedules[windowIndex];
    if (!w) return;
    const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day];
    updateWindow(windowIndex, { days });
  };

  return (
    <div className="sched-section">
      {/* Header: label + mode toggle */}
      <div className="sched-header">
        <span className="sched-header__label">Schedule</span>
        <div className="seg">
          <button
            type="button"
            className={`seg__option${!isScheduled ? " seg__option--active" : ""}`}
            onClick={handleToggleMode}
          >
            Always active
          </button>
          <button
            type="button"
            className={`seg__option${isScheduled ? " seg__option--active" : ""}`}
            onClick={handleToggleMode}
          >
            Scheduled
          </button>
        </div>
      </div>

      {/* Window list */}
      {isScheduled && (
        <>
          <div className="sched-windows">
            {schedules.map((w, wi) => (
              <div key={wi} className="sched-window">
                {/* Top row: enabled toggle + remove */}
                <div className="sched-window__top">
                  <div className="sched-window__top-left">
                    <label className="toggle">
                      <input
                        className="toggle__input"
                        type="checkbox"
                        checked={w.enabled}
                        onChange={(e) => updateWindow(wi, { enabled: e.target.checked })}
                      />
                      <span className="toggle__track"><span className="toggle__thumb" /></span>
                    </label>
                    <span className="sched-window__enabled-label">
                      {w.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm btn--icon"
                    title="Remove window"
                    onClick={() => removeWindow(wi)}
                  >
                    ✕
                  </button>
                </div>

                {/* Day pills: S M T W T F S */}
                <div className="sched-days">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      className={`sched-day${w.days.includes(day) ? " sched-day--active" : ""}`}
                      title={["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]}
                      onClick={() => toggleDay(wi, day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Time inputs */}
                <div className="sched-window__times">
                  <input
                    className="input"
                    type="time"
                    value={minutesToTime(w.startMinutes)}
                    onChange={(e) =>
                      updateWindow(wi, { startMinutes: timeToMinutes(e.target.value) })
                    }
                  />
                  <span className="sched-window__times-sep">to</span>
                  <input
                    className="input"
                    type="time"
                    value={minutesToTime(w.endMinutes)}
                    onChange={(e) =>
                      updateWindow(wi, { endMinutes: timeToMinutes(e.target.value) })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add window button */}
          {schedules.length < MAX_WINDOWS && (
            <button
              type="button"
              className="btn btn-ghost btn--sm sched-add-btn"
              onClick={addWindow}
            >
              + Add window
            </button>
          )}
        </>
      )}

      {error && <p className="sched-error">{error}</p>}
    </div>
  );
}
