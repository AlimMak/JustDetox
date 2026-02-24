import type { InputHTMLAttributes } from "react";

interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Toggle({ label, className = "", ...rest }: ToggleProps) {
  return (
    <label
      className={`toggle ${rest.disabled ? "toggle--disabled" : ""} ${className}`}
      aria-label={label}
    >
      <input className="toggle__input" type="checkbox" {...rest} />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}
