// Every game for one player, in lobby order. Kept apart from GAMES on purpose:
// GAME_IDS feeds the match routes, and an arcade game has no seats to match.
import type { ArcadeDefinition, ArcadeState } from "./game.js";
import { sputnik } from "./sputnik/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each game has its own variant/state/input shapes
export type AnyArcadeGame = ArcadeDefinition<any, ArcadeState, any>;

export const ARCADE_GAMES: readonly AnyArcadeGame[] = [sputnik];

export const ARCADE_IDS = ARCADE_GAMES.map((game) => game.id);

export function getArcadeGame(id: string): AnyArcadeGame | undefined {
  return ARCADE_GAMES.find((game) => game.id === id);
}
