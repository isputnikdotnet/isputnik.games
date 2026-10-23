import { useCallback, useEffect, useRef, useState } from "react";
import { newGameKey } from "../../shared/gameKey";
import { Dots, type DotsMove, type PlayerIndex } from "@isputnik/games-engine";
import { clearDotsGame, loadDotsGame, saveDotsGame, saveDotsSetup, type DotsSetup, type LoadedDotsGame } from "./storage";

// One local game of Dots: the position, the setup it was started with, and the
// moves on it. Every change goes through the engine and is saved at once; the
// computer takes its turn from an effect so the board paints the human's move
// before it answers.
const COMPUTER_DELAY_MS = 450;

export interface DotsGameController {
  game: LoadedDotsGame | null;
  thinking: boolean;
  start(setup: DotsSetup): void;
  place(move: DotsMove): void;
  undo(): void;
  end(): void;
  abandon(): void;
  /** Whether the seat to move is a person at this screen. */
  humanToMove: boolean;
}

export function isComputerSeat(setup: DotsSetup, player: PlayerIndex): boolean {
  return setup.mode === "computer" && setup.computerPlays === player;
}

export function useDotsGame(): DotsGameController {
  const [game, setGame] = useState<LoadedDotsGame | null>(() => loadDotsGame());
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | null>(null);

  const update = useCallback((next: LoadedDotsGame | null) => {
    setGame(next);
    if (next) saveDotsGame(next);
    else clearDotsGame();
  }, []);

  const start = useCallback((setup: DotsSetup) => {
    saveDotsSetup(setup);
    update({ setup, key: newGameKey(), state: Dots.createGame({ size: setup.size, targetCaptures: setup.targetCaptures }) });
  }, [update]);

  const place = useCallback((move: DotsMove) => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      if (!Dots.isPlayable(current.state, move.x, move.y)) return current;
      const next = { ...current, state: Dots.applyMove(current.state, move) };
      saveDotsGame(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setGame((current) => {
      if (!current || current.state.moves.length === 0) return current;
      let state = Dots.undoMove(current.state);
      // Against the computer, undo takes back the pair: its reply and your move,
      // so it is your turn again rather than the computer's to repeat itself.
      if (current.setup.mode === "computer" && state.status.kind === "playing"
        && isComputerSeat(current.setup, state.status.turn) && state.moves.length > 0) {
        state = Dots.undoMove(state);
      }
      const next = { ...current, state };
      saveDotsGame(next);
      return next;
    });
  }, []);

  const end = useCallback(() => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      const next = { ...current, state: Dots.finish(current.state, "agreed") };
      saveDotsGame(next);
      return next;
    });
  }, []);

  const abandon = useCallback(() => update(null), [update]);

  const status = game?.state.status;
  const computerTurn = Boolean(game && status?.kind === "playing" && isComputerSeat(game.setup, status.turn));

  useEffect(() => {
    if (!computerTurn || !game) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const level = game.setup.level;
    const state = game.state;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const move = Dots.chooseDotsMove(state, level, Math.random);
      setThinking(false);
      if (move) place(move);
    }, COMPUTER_DELAY_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [computerTurn, game, place]);

  return {
    game,
    thinking,
    start,
    place,
    undo,
    end,
    abandon,
    humanToMove: Boolean(game && status?.kind === "playing" && !computerTurn)
  };
}
