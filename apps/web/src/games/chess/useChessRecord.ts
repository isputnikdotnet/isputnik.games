import { useEffect, useState } from "react";
import { saveGameRecord } from "../../api";
import { finishOf, type LoadedChessGame } from "./storage";

/** Keys sent in this page's life, with the id the server gave each. */
const sent = new Map<string, string | null>();

// When a game on this device ends, its moves go to the server to be kept for
// review (My games), against the computer or two at one screen. Like a
// computer result, one that fails to send goes again the next time the
// finished game is opened. Answers the record's id once the server has it,
// for the Review button; null until then.
export function useChessRecord(game: LoadedChessGame | null): string | null {
  const finished = game?.state.status.kind === "finished";
  const key = finished ? game!.key : null;
  const [id, setId] = useState<string | null>(key ? sent.get(key) ?? null : null);

  useEffect(() => {
    if (!game || !key) return;
    if (sent.has(key)) {
      setId(sent.get(key) ?? null);
      return;
    }
    sent.set(key, null);
    const { setup, state } = game;
    const finish = finishOf(state);
    saveGameRecord({
      game: "chess",
      key,
      mode: setup.mode,
      ...(setup.mode === "computer" ? { level: setup.level, seat: setup.computerPlays === 0 ? 1 : 0 } : {}),
      moves: state.moves,
      ...(finish ? { finish } : {})
    }).then((saved) => {
      sent.set(key, saved.id);
      setId(saved.id);
    }, () => sent.delete(key));
    // The key names the ending: nothing else about it changes once it is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key ? id : null;
}
