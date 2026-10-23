import { useCallback, useEffect, useRef, useState } from "react";
import { SeaBattle, type PlayerIndex, type SeaBattleMove } from "@isputnik/games-engine";
import {
  clearSeaBattleGame,
  loadSeaBattleGame,
  saveSeaBattleGame,
  saveSeaBattleSetup,
  type LoadedSeaBattleGame,
  type SeaBattleSetup
} from "./storage";

// One local game of Sea Battle: the position, the setup it was started with,
// and the moves so far. Every change goes through the engine and is saved at
// once; the computer lays its fleet and fires from an effect, with a pause per
// shot so a person can follow its run of hits.
const COMPUTER_PLACE_MS = 600;
const COMPUTER_SHOT_MS = 800;

export interface SeaBattleGameController {
  game: LoadedSeaBattleGame | null;
  thinking: boolean;
  start(setup: SeaBattleSetup): void;
  play(move: SeaBattleMove): void;
  end(): void;
  abandon(): void;
  /** Whether the seat to move is a person at this screen. */
  humanToMove: boolean;
}

export function isComputerSeat(setup: SeaBattleSetup, player: PlayerIndex): boolean {
  return setup.mode === "computer" && setup.computerPlays === player;
}

export function useSeaBattleGame(): SeaBattleGameController {
  const [game, setGame] = useState<LoadedSeaBattleGame | null>(() => loadSeaBattleGame());
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | null>(null);

  const update = useCallback((next: LoadedSeaBattleGame | null) => {
    setGame(next);
    if (next) saveSeaBattleGame(next);
    else clearSeaBattleGame();
  }, []);

  const start = useCallback((setup: SeaBattleSetup) => {
    saveSeaBattleSetup(setup);
    update({ setup, moves: [], state: SeaBattle.createGame({ fleet: setup.fleet }) });
  }, [update]);

  const play = useCallback((move: SeaBattleMove) => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      let state;
      try {
        state = SeaBattle.applyMove(current.state, move);
      } catch {
        return current;
      }
      const next = { setup: current.setup, moves: [...current.moves, move], state };
      saveSeaBattleGame(next);
      return next;
    });
  }, []);

  const end = useCallback(() => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      const next = { ...current, state: SeaBattle.finish(current.state, "agreed") };
      saveSeaBattleGame(next);
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
    const delay = SeaBattle.phaseOf(state) === "placing" ? COMPUTER_PLACE_MS : COMPUTER_SHOT_MS;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const move = SeaBattle.chooseSeaBattleMove(state, level, Math.random);
      setThinking(false);
      if (move) play(move);
    }, delay);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [computerTurn, game, play]);

  return {
    game,
    thinking,
    start,
    play,
    end,
    abandon,
    humanToMove: Boolean(game && status?.kind === "playing" && !computerTurn)
  };
}
