import type { ArcadeCue } from "@isputnik/games-engine";
import type { Cue } from "../../shared/sound";
import type { HandheldMode } from "./lit";

const STEP_CUES: Cue[] = ["lcdStep0", "lcdStep1", "lcdStep2", "lcdStep3"];

/** What one tick of a run sounds like: one beep a tick, as on the handheld,
 *  except a catch that earns a pardon. The demo is silent. */
export function soundsOf(cues: readonly ArcadeCue[], mode: HandheldMode): Cue[] {
  if (mode !== "play") return [];
  const has = (kind: string) => cues.find((cue) => cue.kind === kind);
  if (has("over")) return ["lcdOver"];
  if (has("crash")) return ["lcdCrash"];
  if (has("alien")) return ["lcdAlien"];
  if (has("catch")) return has("pardon") ? ["lcdCatch", "lcdPardon"] : ["lcdCatch"];
  const step = has("step");
  return step ? [STEP_CUES[step.rail as number]] : [];
}
