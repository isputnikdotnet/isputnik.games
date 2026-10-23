import type { GameEvent, PlayerIndex } from "@isputnik/games-engine";
import type { CommsLine } from "../../shared/commsLines";

type T = (key: "chess.sanLetters" | "chess.comms.check" | "chess.comms.mate") => string;

/**
 * A move in standard notation with the reader's piece letters: the engine
 * writes K Q R B N, and `letters` is the same five in the reader's language,
 * comma-separated ("Кр,Ф,Л,С,К"). Files are lower case, so only the piece
 * letters change; castling stays O-O.
 */
export function localSan(san: string, letters: string): string {
  const own = letters.split(",");
  if (own.length !== 5) return san;
  return san.replace(/[KQRBN]/g, (letter) => own["KQRBN".indexOf(letter)]);
}

/** The events of a game of chess as Comms lines, seen from seat `me`:
 *  "12. Nf3", "12… exd5", with check and mate called out. */
export function chessLines(feed: GameEvent[], me: PlayerIndex, names: [string, string], t: T): CommsLine[] {
  const letters = t("chess.sanLetters");
  return feed.map((event, index) => {
    const who = event.by === me ? "you" : "them";
    const number = `${event.number as number}${event.by === 0 ? "." : "…"}`;
    const line: CommsLine = {
      key: `e${index}`,
      kind: "event",
      who,
      name: names[event.by],
      text: `${number} ${localSan(event.san as string, letters)}`
    };
    if (event.mate) line.result = { text: t("chess.comms.mate"), tone: who === "you" ? "good" : "bad" };
    else if (event.check) line.result = { text: t("chess.comms.check"), tone: "neutral" };
    return line;
  });
}
