import { CircleDot, Ship, type LucideIcon } from "lucide-react";
import { loadDotsGame } from "./dots/storage";
import { loadSeaBattleGame } from "./seabattle/storage";

// What the lobby and the invite dialog show for each game in the engine's
// registry: an icon and the keys of its name and summary, and whether a local
// game of it is in progress on this device. A game without an entry here is
// not offered, whatever the engine knows.
export type GameNameKey = "games.dots.name" | "games.seabattle.name";
export type GameSummaryKey = "games.dots.summary" | "games.seabattle.summary";

export interface CatalogEntry {
  icon: LucideIcon;
  name: GameNameKey;
  summary: GameSummaryKey;
  inProgress: () => boolean;
}

export const CATALOG: Record<string, CatalogEntry> = {
  dots: {
    icon: CircleDot,
    name: "games.dots.name",
    summary: "games.dots.summary",
    inProgress: () => loadDotsGame()?.state.status.kind === "playing"
  },
  seabattle: {
    icon: Ship,
    name: "games.seabattle.name",
    summary: "games.seabattle.summary",
    inProgress: () => loadSeaBattleGame()?.state.status.kind === "playing"
  }
};
