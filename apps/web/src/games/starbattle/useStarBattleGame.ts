import { useCallback, useEffect, useRef, useState } from "react";
import { newGameKey } from "../../shared/gameKey";
import { StarBattle, type PlayerIndex, type StarBattleMove } from "@isputnik/games-engine";
import {
  clearStarBattleGame,
  loadStarBattleGame,
  saveStarBattleGame,
  saveStarBattleSetup,
  type LoadedStarBattleGame,
  type StarBattleSetup
} from "./storage";

// One local game of Star Battle: the position, the setup it was started with,
// and the moves so far. Every change goes through the engine and is saved at
// once; the computer deploys its fleet and fires from an effect, with a pause per
// shot so a person can follow its run of hits.
/** Mutable so a test can take the waiting out. */
export const COMPUTER_DELAYS = { place: 600, shot: 800 };

export interface StarBattleGameController {
  game: LoadedStarBattleGame | null;
  thinking: boolean;
  start(setup: StarBattleSetup): void;
  play(move: StarBattleMove): void;
  end(): void;
  abandon(): void;
  /** Whether the seat to move is a person at this screen. */
  humanToMove: boolean;
}

export function isComputerSeat(setup: StarBattleSetup, player: PlayerIndex): boolean {
  return setup.computerPlays === player;
}

export function useStarBattleGame(): StarBattleGameController {
  const [game, setGame] = useState<LoadedStarBattleGame | null>(() => loadStarBattleGame());
  const [thinking, setThinking] = useState(false);
  const timer = useRef<number | null>(null);

  const update = useCallback((next: LoadedStarBattleGame | null) => {
    setGame(next);
    if (next) saveStarBattleGame(next);
    else clearStarBattleGame();
  }, []);

  const start = useCallback((setup: StarBattleSetup) => {
    saveStarBattleSetup(setup);
    update({ setup, key: newGameKey(), moves: [], state: StarBattle.createGame({ fleet: setup.fleet }) });
  }, [update]);

  const play = useCallback((move: StarBattleMove) => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      let state;
      try {
        state = StarBattle.applyMove(current.state, move);
      } catch {
        return current;
      }
      const next = { ...current, moves: [...current.moves, move], state };
      saveStarBattleGame(next);
      return next;
    });
  }, []);

  const end = useCallback(() => {
    setGame((current) => {
      if (!current || current.state.status.kind !== "playing") return current;
      const next = { ...current, state: StarBattle.finish(current.state, "agreed") };
      saveStarBattleGame(next);
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
    const delay = StarBattle.phaseOf(state) === "placing" ? COMPUTER_DELAYS.place : COMPUTER_DELAYS.shot;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const move = StarBattle.chooseStarBattleMove(state, level, Math.random);
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
