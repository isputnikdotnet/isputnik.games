import { Sputnik, type SputnikRail, type SputnikState } from "@isputnik/games-engine";
import { DIGITS } from "./sprites";

/** test: every segment lit, the moment the handheld is switched on.
 *  demo: it plays itself until Game A or B is pressed. */
export type HandheldMode = "test" | "demo" | "play" | "paused" | "over";

export interface LcdView {
  mode: HandheldMode;
  state: SputnikState;
  /** Where the net is now: the player's last press, not the last tick's. */
  net: SputnikRail;
  /** The blink phase, for half an alien and the end of a run. */
  blink: boolean;
}

/** Which segments are dark for this moment of the run (sprites.ts names them).
 *  `all` is every id there is, for the switch-on test. */
export function litSegments(view: LcdView, all: readonly string[]): Set<string> {
  if (view.mode === "test") return new Set(all);
  const { state, net, blink } = view;
  const on = new Set<string>();

  for (const sputnik of state.sputniks) on.add(`s${sputnik.rail}${sputnik.step}`);
  // At the end the robot blinks; until then he stands where the net is.
  if (view.mode !== "over" || blink) {
    on.add(net < 2 ? "robot-left" : "robot-right");
    on.add(`net${net}`);
  }

  const score = String(Sputnik.displayScore(state));
  [...score.padStart(4, " ")].forEach((char, i) => {
    if (char !== " ") for (const stroke of DIGITS[char]) on.add(`d${i}${stroke}`);
  });

  const whole = Math.min(3, Math.floor(state.halves / 2));
  for (let i = 0; i < whole; i++) on.add(`miss${i}`);
  if (state.halves % 2 === 1 && whole < 3 && blink) on.add(`miss${whole}`);

  if (state.belka.out) on.add("belka");
  if (state.crash) {
    on.add(`wreck-${state.crash.side}`);
    on.add(`alien-${state.crash.side}${Math.min(state.crash.step, Sputnik.ALIEN_STEPS - 1)}`);
  }
  if (view.mode !== "demo") on.add(state.variant === "A" ? "game-a" : "game-b");
  return on;
}

/** The demo's player: the net under whichever sputnik lands next. */
export function autopilot(state: SputnikState, current: SputnikRail): SputnikRail {
  let lead: SputnikState["sputniks"][number] | null = null;
  for (const sputnik of state.sputniks) if (!lead || sputnik.step > lead.step) lead = sputnik;
  return lead ? lead.rail : current;
}
