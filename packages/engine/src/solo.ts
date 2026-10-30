// Every puzzle for one player, in lobby order. Apart from GAMES (no seats to
// match) and from ARCADE_GAMES (no clock and no replayed score): a puzzle is
// solved or not, on the device it is played on.
import { crossmath } from "./crossmath/index.js";

export interface SoloDefinition<L extends string = string> {
  /** Stable id, used in URLs: "crossmath". */
  id: string;
  /** Its levels, easiest first. */
  levels: readonly L[];
}

export const SOLO_GAMES: readonly SoloDefinition[] = [crossmath];

export function getSoloGame(id: string): SoloDefinition | undefined {
  return SOLO_GAMES.find((game) => game.id === id);
}
