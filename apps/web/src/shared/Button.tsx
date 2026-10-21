import React from "react";

// The single way to render a button, as in the home app: every button names its
// variant, and the look lives in the stylesheet under that class.
//   primary    the one call to action on a surface (Start game)
//   secondary  outlined neutral (Cancel, Undo)
//   danger     filled destructive (End game, confirming an abandon)
//   text       borderless inline action
//   icon       square icon-only — pass aria-label or title
//   chip       a small pill in a row of choices; `selected` marks the chosen one
export type ButtonVariant = "primary" | "secondary" | "danger" | "text" | "icon" | "chip";

const variantClass: Record<ButtonVariant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  danger: "danger-button",
  text: "text-button",
  icon: "icon-button",
  chip: "chip-button"
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  selected?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", selected, className, type = "button", ...rest },
  ref
) {
  const classes = [variantClass[variant], selected && "is-selected", className].filter(Boolean).join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-pressed={variant === "chip" && selected !== undefined ? selected : undefined}
      {...rest}
    />
  );
});
