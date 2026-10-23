import { Button } from "./Button";

// A labelled row of chips, one of which is chosen: a setting on a new-game form.
export function Choice<T extends string | number | null>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setup-row" role="group" aria-label={label}>
      <span className="setup-label">{label}</span>
      <div className="chip-row">
        {options.map((option) => (
          <Button
            key={String(option.value)}
            variant="chip"
            selected={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
