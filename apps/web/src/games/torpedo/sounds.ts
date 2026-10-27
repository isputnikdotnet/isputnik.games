import type { ArcadeCue } from "@isputnik/games-engine";
import type { Cue } from "../../shared/sound";
import type { TorpedoMode } from "./useTorpedoRun";

/** What one tick sounds like: the launch, a ping per lane passed, the blast or
 *  the splash, the bonus and the end. The demo is silent. */
export function soundsOf(cues: readonly ArcadeCue[], mode: TorpedoMode): Cue[] {
  if (mode !== "play") return [];
  const sounds: Cue[] = [];
  const has = (kind: string) => cues.some((cue) => cue.kind === kind);
  if (has("round")) sounds.push("torpedoStart");
  if (has("launch")) sounds.push("torpedoLaunch");
  if (has("pass")) sounds.push("torpedoPing");
  if (has("hit")) sounds.push("torpedoHit");
  if (has("miss")) sounds.push("torpedoMiss");
  if (has("bonus")) sounds.push("torpedoBonus");
  if (has("over")) sounds.push("torpedoOver");
  return sounds;
}
