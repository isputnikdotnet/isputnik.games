import { useEffect, useState } from "react";
import type { AiLevel, PlayerIndex } from "@isputnik/games-engine";
import { reportComputerResult, type ChessRating } from "../api";

/** Keys reported in this page's life: a re-render of the finished board must
 *  not post again. A reload may; the server keeps one result per key anyway. */
const reported = new Map<string, ChessRating | null>();

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
// opened: it stays saved on the device until a new one starts. A chess game
// answers with the chess rating it left, for the panel; null until then.
export function useComputerResult(end: ComputerGameEnd | null): ChessRating | null {
  const key = end?.key ?? null;
  const [rating, setRating] = useState<ChessRating | null>(key ? reported.get(key) ?? null : null);
  useEffect(() => {
    if (!end) return;
    if (reported.has(end.key)) {
      setRating(reported.get(end.key) ?? null);
      return;
    }
    reported.set(end.key, null);
    const result = end.winner === null ? "drawn" : end.winner === end.human ? "won" : "lost";
    reportComputerResult({ game: end.game, level: end.level, result, key: end.key }).then((answer) => {
      reported.set(end.key, answer?.chessRating ?? null);
      setRating(answer?.chessRating ?? null);
    }, () => reported.delete(end.key));
    // The key names the ending: nothing else about it changes once it is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? rating : null;
}
