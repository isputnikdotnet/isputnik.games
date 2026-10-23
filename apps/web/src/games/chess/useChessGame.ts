import { useCallback, useEffect, useState } from "react";
import { Chess, type ChessMove, type PlayerIndex } from "@isputnik/games-engine";
import { clearChessGame, loadChessGame, saveChessGame, saveChessSetup, type ChessSetup, type LoadedChessGame } from "./storage";

// One local game of chess: the position, the setup it was started with, and
// the moves on it. Every change goes through the engine and is saved at once;
// the computer takes its turn from an effect, after a pause, so the board
// paints the human's move before the search holds the page for its answer.
export const COMPUTER_DELAY = { ms: 350 };

export interface ChessGameController {
  game: LoadedChessGame | null;
  thinking: boolean;
  start(setup: ChessSetup): void;
  move(move: ChessMove): void;
  undo(): void;
  /** Ends the game as a draw both players agreed (two at one screen). */
  agreeDraw(): void;
  /** The person at the screen gives up; with two, the side to move does. */
  resign(): void;
  abandon(): void;
  /** The seat a person at this screen may move now, or null. */
  humanToMove: PlayerIndex | null;
}

export function isComputerSeat(setup: ChessSetup, player: PlayerIndex): boolean {
  return setup.mode === "computer" && setup.computerPlays === player;
}

/** The seat of the person playing the computer; null when two share the screen. */
export function humanSeat(setup: ChessSetup): PlayerIndex | null {
  return setup.mode === "computer" ? (setup.computerPlays === 0 ? 1 : 0) : null;
}

export function useChessGame(): ChessGameController {
  const [game, setGame] = useState<LoadedChessGame | null>(() => loadChessGame());
  const [thinking, setThinking] = useState(false);

  const change = useCallback((next: (current: LoadedChessGame) => LoadedChessGame | null) => {
    setGame((current) => {
      if (!current) return current;
      const updated = next(current);
      if (updated && updated !== current) saveChessGame(updated);
      return updated ?? current;
    });
  }, []);

  const start = useCallback((setup: ChessSetup) => {
    saveChessSetup(setup);
    const next = { setup, state: Chess.createGame() };
    saveChessGame(next);
    setGame(next);
  }, []);

  const move = useCallback((played: ChessMove) => {
    change((current) => {
      if (current.state.status.kind !== "playing") return null;
      try {
        return { setup: current.setup, state: Chess.applyMove(current.state, played) };
      } catch {
        return null;
      }
    });
  }, [change]);

  const undo = useCallback(() => {
    change((current) => {
      if (current.state.moves.length === 0) return null;
      let state = Chess.undoMove(current.state);
      // Against the computer, undo takes back the pair — its reply and your
      // move — so it is your turn again rather than the computer's.
      if (current.setup.mode === "computer" && state.status.kind === "playing"
        && isComputerSeat(current.setup, state.status.turn) && state.moves.length > 0) {
        state = Chess.undoMove(state);
      }
      return { setup: current.setup, state };
    });
  }, [change]);

  const agreeDraw = useCallback(() => {
    change((current) => (current.state.status.kind === "playing"
      ? { setup: current.setup, state: Chess.finish(current.state, "agreed") }
      : null));
  }, [change]);

  const resign = useCallback(() => {
    change((current) => {
      const status = current.state.status;
      if (status.kind !== "playing") return null;
      const loser = humanSeat(current.setup) ?? status.turn;
      return { setup: current.setup, state: Chess.finish(current.state, "resigned", loser) };
    });
  }, [change]);

  const abandon = useCallback(() => {
    clearChessGame();
    setGame(null);
  }, []);

  const status = game?.state.status;
  const computerTurn = Boolean(game && status?.kind === "playing" && isComputerSeat(game.setup, status.turn));

  useEffect(() => {
    if (!computerTurn || !game) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const { level } = game.setup;
    const state = game.state;
    const timer = window.setTimeout(() => {
      const answer = Chess.chooseChessMove(state, level, Math.random);
      setThinking(false);
      if (answer) move(answer);
    }, COMPUTER_DELAY.ms);
    return () => window.clearTimeout(timer);
  }, [computerTurn, game, move]);

  return {
    game,
    thinking,
    start,
    move,
    undo,
    agreeDraw,
    resign,
    abandon,
    humanToMove: game && status?.kind === "playing" && !computerTurn ? status.turn : null
  };
}
