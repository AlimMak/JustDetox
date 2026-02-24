import { useState } from "react";
import { sanitizeDomain, isValidDomain } from "../../../core/validation";

interface DomainPillInputProps {
  domains: string[];
  onChange: (domains: string[]) => void;
  placeholder?: string;
}

/**
 * Multi-domain list input rendered as removable pills.
 *
 * Accepts plain hostnames, full URLs (strips protocol/path), and paste of
 * comma/whitespace-separated lists.
 */
export function DomainPillInput({
  domains,
  onChange,
  placeholder = "twitter.com or paste URLs…",
}: DomainPillInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tryAdd = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed) return false;

    const cleaned = sanitizeDomain(trimmed);
    if (!isValidDomain(cleaned)) {
      setError(`"${trimmed}" is not a valid domain`);
      return false;
    }
    if (domains.includes(cleaned)) {
      setError(`"${cleaned}" is already in the list`);
      return false;
    }

    setError(null);
    onChange([...domains, cleaned]);
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tryAdd(inputValue)) setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && domains.length > 0) {
      // Remove last pill on backspace when input is empty
      onChange(domains.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const pieces = pasted.split(/[\s,;\n]+/).filter(Boolean);

    const added: string[] = [];
    const skipped: string[] = [];

    for (const piece of pieces) {
      const cleaned = sanitizeDomain(piece);
      if (
        cleaned &&
        isValidDomain(cleaned) &&
        !domains.includes(cleaned) &&
        !added.includes(cleaned)
      ) {
        added.push(cleaned);
      } else if (cleaned && !isValidDomain(cleaned)) {
        skipped.push(piece.trim());
      }
    }

    if (added.length > 0) {
      onChange([...domains, ...added]);
      setInputValue("");
    }

    setError(
      skipped.length > 0
        ? `Skipped invalid: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}`
        : null,
    );
  };

  const remove = (domain: string) => {
    setError(null);
    onChange(domains.filter((d) => d !== domain));
  };

  return (
    <div className="pill-input-wrapper">
      <div className="pill-input-box">
        {domains.map((d) => (
          <span key={d} className="pill">
            <span className="pill-label">{d}</span>
            <button
              type="button"
              className="pill-remove"
              onClick={() => remove(d)}
              aria-label={`Remove ${d}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="pill-text-input"
          value={inputValue}
          placeholder={domains.length === 0 ? placeholder : "add more…"}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
      {error && <p className="form-error" style={{ marginTop: 4 }}>{error}</p>}
    </div>
  );
}
