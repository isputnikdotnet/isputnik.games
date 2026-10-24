import { getGame } from "@isputnik/games-engine";
import type { MatchSummary } from "../api";

type T = (key: "lobby.penaltyScore", options: Record<string, unknown>) => string;

/** A match's score for a list, seat 0 first: "3 : 1". A game that collects
 *  points towards losing (Dominoes) says so, or "12 : 54" would read as the
 *  leader losing. Null for a game that keeps no score. */
export function scoreText(match: Pick<MatchSummary, "game" | "score" | "options">, t: T): string | null {
  if (!match.score) return null;
  const [a, b] = match.score;
  const target = (match.options as { target?: unknown } | null)?.target;
  if (getGame(match.game)?.scoreSense === "penalty" && typeof target === "number") {
    return t("lobby.penaltyScore", { a, b, target });
  }
  return `${a} : ${b}`;
}
