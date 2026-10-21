// Every game the platform offers, in lobby order. A new game is a folder beside
// dots/ implementing GameDefinition, and a line here; the web app's lobby and
// (phase 2) the server's match tables take it from this list.
import type { GameDefinition, GameStatus } from "./game.js";
import { dots } from "./dots/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each game has its own option/state/move shapes
export type AnyGame = GameDefinition<any, { status: GameStatus }, any>;

export const GAMES: readonly AnyGame[] = [dots];

export const GAME_IDS = GAMES.map((game) => game.id);

export function getGame(id: string): AnyGame | undefined {
  return GAMES.find((game) => game.id === id);
}
