interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (val: T) => void;
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  fullWidth = false,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`seg ${fullWidth ? "seg--full" : ""} ${className}`}
      role="group"
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`seg__option ${value === opt.value ? "seg__option--active" : ""}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
