import { StrictMode, useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { readStorage, writeStorage } from "../../shared/storage";
import type { BlockedSite, BlockMode } from "../../shared/types";
import "../shared.css";
import "./options.css";

// ─── State ────────────────────────────────────────────────────────────────────

interface FormState {
  hostname: string;
  mode: BlockMode;
  dailyLimitMinutes: number;
}

const FORM_DEFAULTS: FormState = {
  hostname: "",
  mode: "block",
  dailyLimitMinutes: 30,
};

type Action =
  | { type: "SET_FIELD"; field: keyof FormState; value: string | number | BlockMode }
  | { type: "RESET" };

function formReducer(state: FormState, action: Action): FormState {
  if (action.type === "RESET") return FORM_DEFAULTS;
  return { ...state, [action.field]: action.value };
}

// ─── Options page ─────────────────────────────────────────────────────────────

function Options() {
  const [sites, setSites] = useState<BlockedSite[]>([]);
  const [form, dispatch] = useReducer(formReducer, FORM_DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readStorage().then((s) => setSites(s.blockedSites));
  }, []);

  const persistSites = async (updated: BlockedSite[]) => {
    setSites(updated);
    await writeStorage({ blockedSites: updated });
  };

  const addSite = async () => {
    const raw = form.hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!raw) {
      setError("Enter a hostname (e.g. twitter.com)");
      return;
    }
    if (sites.some((s) => s.hostname === raw)) {
      setError(`${raw} is already in your list.`);
      return;
    }
    setError(null);

    const newSite: BlockedSite = {
      hostname: raw,
      mode: form.mode,
      ...(form.mode === "time-limit" ? { dailyLimitMinutes: form.dailyLimitMinutes } : {}),
    };

    await persistSites([...sites, newSite]);
    dispatch({ type: "RESET" });
  };

  const removeSite = async (hostname: string) => {
    await persistSites(sites.filter((s) => s.hostname !== hostname));
  };

  return (
    <div className="options-root">
      <header className="options-header">
        <h1 className="options-title">JustDetox</h1>
        <p className="options-sub">Manage your blocked and time-limited sites</p>
      </header>

      <section className="options-card">
        <h2 className="section-title">Add a site</h2>

        <div className="form-row">
          <input
            type="text"
            placeholder="twitter.com"
            value={form.hostname}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "hostname", value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addSite()}
          />
        </div>

        <div className="form-row form-row--split">
          <label className="form-label">
            Mode
            <select
              value={form.mode}
              onChange={(e) =>
                dispatch({ type: "SET_FIELD", field: "mode", value: e.target.value as BlockMode })
              }
            >
              <option value="block">Block entirely</option>
              <option value="time-limit">Daily time limit</option>
            </select>
          </label>

          {form.mode === "time-limit" && (
            <label className="form-label">
              Minutes / day
              <input
                type="number"
                min={1}
                max={1440}
                value={form.dailyLimitMinutes}
                onChange={(e) =>
                  dispatch({
                    type: "SET_FIELD",
                    field: "dailyLimitMinutes",
                    value: Number(e.target.value),
                  })
                }
              />
            </label>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary" onClick={addSite}>
          Add site
        </button>
      </section>

      <section className="options-card">
        <h2 className="section-title">Blocked sites</h2>
        {sites.length === 0 ? (
          <p className="muted">No sites added yet.</p>
        ) : (
          <ul className="site-list-full">
            {sites.map((site) => (
              <li key={site.hostname} className="site-row-full">
                <div className="site-info">
                  <span className="site-name">{site.hostname}</span>
                  <span className="site-badge">
                    {site.mode === "block"
                      ? "Blocked"
                      : `${site.dailyLimitMinutes ?? 0} min / day`}
                  </span>
                </div>
                <button className="btn-danger" onClick={() => removeSite(site.hostname)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
