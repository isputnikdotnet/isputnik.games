import { useEffect } from "react";
import type { AiLevel, PlayerIndex } from "@isputnik/games-engine";
import { reportComputerResult } from "../api";

/** Keys reported in this page's life: a re-render of the finished board must
 *  not post again. A reload may; the server keeps one result per key anyway. */
const reported = new Set<string>();

export interface ComputerGameEnd {
  game: string;
  /** The local game's own id (shared/gameKey). */
  key: string;
  /** The level the game ended on (Chess lets it change during the game). */
  level: AiLevel;
  /** The person's seat. */
  human: PlayerIndex;
  /** Null for a draw. */
  winner: PlayerIndex | null;
}

// When a game against the computer ends, the result goes to the server for the
// family leaderboard's vs Computer tab. Pass null while the game is on, or when
// it is not against the computer (two at one screen never counts). A result
// that fails to send (offline) goes again when the finished game is next
// opened: it stays saved on the device until a new one starts.
export function useComputerResult(end: ComputerGameEnd | null): void {
  const key = end?.key ?? null;
  useEffect(() => {
    if (!end || reported.has(end.key)) return;
    reported.add(end.key);
    const result = end.winner === null ? "drawn" : end.winner === end.human ? "won" : "lost";
    reportComputerResult({ game: end.game, level: end.level, result, key: end.key }).catch(() => reported.delete(end.key));
    // The key names the ending: nothing else about it changes once it is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
