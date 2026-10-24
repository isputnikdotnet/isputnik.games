import type { GameEvent, PlayerIndex } from "@isputnik/games-engine";
import type { CommsLine } from "../../shared/commsLines";

type Key =
  | "dominoes.comms.lead"
  | "dominoes.comms.left"
  | "dominoes.comms.right"
  | "dominoes.comms.drew"
  | "dominoes.comms.pass"
  | "dominoes.comms.handOut"
  | "dominoes.comms.handFish"
  | "dominoes.comms.handTie";
type T = (key: Key, options?: Record<string, unknown>) => string;

interface HandEvent {
  hand: number;
  winner: PlayerIndex | null;
  fish: boolean;
  points: [number, number];
  totals: [number, number];
}

/** The events of a game of Dominoes as Comms lines, seen from seat `me`. A
 *  run of draws by one player folds into one line; a play that ended a hand is
 *  followed by a line from the game with what the hand was worth. */
export function dominoesLines(feed: GameEvent[], me: PlayerIndex, names: [string, string], t: T): CommsLine[] {
  const lines: CommsLine[] = [];
  let drawRun: { line: CommsLine; count: number; by: PlayerIndex } | null = null;
  feed.forEach((event, index) => {
    const who = event.by === me ? "you" : "them";
    const name = names[event.by];
    if (event.kind === "draw") {
      if (drawRun && drawRun.by === event.by) {
        drawRun.count += 1;
        drawRun.line.text = t("dominoes.comms.drew", { count: drawRun.count });
        return;
      }
      const line: CommsLine = { key: `e${index}`, kind: "event", who, name, text: t("dominoes.comms.drew", { count: 1 }) };
      drawRun = { line, count: 1, by: event.by };
      lines.push(line);
      return;
    }
    drawRun = null;
    if (event.kind === "pass") {
      lines.push({ key: `e${index}`, kind: "event", who, name, text: t("dominoes.comms.pass") });
      return;
    }
    const tile = (event.tile as number[]).join(":");
    const key = event.end === "left" ? "dominoes.comms.left" : event.end === "right" ? "dominoes.comms.right" : "dominoes.comms.lead";
    lines.push({ key: `e${index}`, kind: "event", who, name, text: t(key, { tile }) });
    const hand = event.hand as HandEvent | undefined;
    if (!hand) return;
    if (hand.winner === null) {
      lines.push({ key: `h${index}`, kind: "system", text: t("dominoes.comms.handTie", { hand: hand.hand }) });
      return;
    }
    const payer: PlayerIndex = hand.winner === 0 ? 1 : 0;
    const values = { hand: hand.hand, name: names[hand.winner], payer: names[payer], points: hand.points[payer], total: hand.totals[payer] };
    lines.push({ key: `h${index}`, kind: "system", text: t(hand.fish ? "dominoes.comms.handFish" : "dominoes.comms.handOut", values) });
  });
  return lines;
}
