import type { GameEvent, PlayerIndex } from "@isputnik/games-engine";
import type { CommsLine } from "../../shared/commsLines";

type T = (key: "dots.comms.dot" | "dots.comms.lost", options?: Record<string, unknown>) => string;

/** The events of a game of Dots as Comms lines, seen from seat `me`: a dot,
 *  and what it captured or that it was lost at once. */
export function dotsLines(feed: GameEvent[], me: PlayerIndex, names: [string, string], t: T): CommsLine[] {
  return feed.map((event, index) => {
    const who = event.by === me ? "you" : "them";
    const captured = event.captured as number;
    const line: CommsLine = {
      key: `e${index}`,
      kind: "event",
      who,
      name: names[event.by],
      text: t("dots.comms.dot", { x: (event.x as number) + 1, y: (event.y as number) + 1 })
    };
    if (captured > 0) line.result = { text: `+${captured}`, tone: who === "you" ? "good" : "bad" };
    else if (event.lost) line.result = { text: t("dots.comms.lost"), tone: who === "you" ? "bad" : "good" };
    return line;
  });
}
