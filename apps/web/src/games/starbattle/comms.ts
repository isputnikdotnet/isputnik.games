import type { GameEvent, PlayerIndex } from "@isputnik/games-engine";
import type { CommsLine, Tone } from "../../shared/commsLines";
import { cellName } from "./SectorBoard";

type T = (key: "starbattle.comms.deploy" | "starbattle.comms.fire" | "starbattle.comms.miss" | "starbattle.comms.hit" | "starbattle.comms.destroyed", options?: Record<string, unknown>) => string;

/** The events of a Star Battle game as Comms lines, seen from seat `me`. */
export function starBattleLines(feed: GameEvent[], me: PlayerIndex, names: [string, string], columns: string, t: T): CommsLine[] {
  return feed.map((event, index) => {
    const who = event.by === me ? "you" : "them";
    const name = names[event.by];
    if (event.kind === "deploy") return { key: `e${index}`, kind: "event", who, name, text: t("starbattle.comms.deploy") };
    const result = event.result as "miss" | "hit" | "destroyed";
    const tone: Tone = result === "miss" ? "neutral" : who === "you" ? "good" : "bad";
    const label = result === "miss" ? t("starbattle.comms.miss") : result === "hit" ? t("starbattle.comms.hit") : t("starbattle.comms.destroyed");
    return {
      key: `e${index}`,
      kind: "event",
      who,
      name,
      text: t("starbattle.comms.fire", { cell: cellName(event.x as number, event.y as number, columns) }),
      result: { text: label, tone }
    };
  });
}
