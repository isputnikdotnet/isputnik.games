import type { TimeControl } from "@isputnik/games-engine";

type T = (key: "chess.clock.minutes", options: { count: number }) => string;

/** A time control as the setup offers it: "5 min", or "3 | 2" with an increment. */
export function clockLabel(control: TimeControl, t: T): string {
  return control.increment > 0 ? `${control.minutes} | ${control.increment}` : t("chess.clock.minutes", { count: control.minutes });
}

/** Under this much, the clock shows tenths and turns red. */
export const LOW_MS = 20_000;

/** Time left as a clock face shows it: 4:05, then 9.4 in the last seconds. */
export function formatClock(ms: number): string {
  const left = Math.max(0, ms);
  if (left < LOW_MS) return (Math.floor(left / 100) / 10).toFixed(1);
  const seconds = Math.ceil(left / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
