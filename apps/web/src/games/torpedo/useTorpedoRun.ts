import { useCallback, useEffect, useRef, useState } from "react";
import { Torpedo, type ArcadeCue, type TorpedoInput, type TorpedoState, type TorpedoTurn } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";

/** The breath between pressing Start and the first tick. */
export const START_DELAY = 400;
/** A round's card stays this long before fire will move on from it, so a
 *  player still pressing fire at the end gets to read it. */
export const CARD_HOLD_MS = 1200;
/** Ticks a late timer may play at once before it renders. */
const MAX_CATCH_UP = 25;

const BEST_KEY = "isputnik-games.torpedo.best";

/** demo: the periscope runs itself until Start. bonus: the first round is
 *  over and earned the bonus, waiting for the player to fire it in. */
export type TorpedoMode = "demo" | "play" | "paused" | "bonus" | "over";

/** A finished run as the server wants it: enough to replay it. */
export interface FinishedRun {
  key: string;
  variant: "standard";
  seed: number;
  log: [number, TorpedoInput][];
  score: number;
  /** A new best on this device. */
  best: boolean;
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* private mode: the best holds for this visit */
  }
}

function randomSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

const { SHIPS, RANGE, MAX_BEARING, SIGHT_SPEED } = Torpedo;

/** Where a ship will be when a torpedo fired now gets to its lane. */
const leadOf = (ship: TorpedoState["ships"][number]) => ship.x + ship.dir * ship.speed * (RANGE[SHIPS[ship.kind].lane] + 1);

const turnToward = (from: number, to: number): TorpedoTurn => (Math.abs(to - from) <= SIGHT_SPEED / 2 ? 0 : to > from ? 1 : -1);

/** The demo's gunner: swings onto the best ship in reach and fires, not
 *  always well, so the attract mode shows misses too. */
function autopilot(state: TorpedoState): TorpedoInput {
  const target = state.ships
    .filter((ship) => ship.sinking === null && Math.abs(leadOf(ship)) <= MAX_BEARING)
    .sort((a, b) => SHIPS[b.kind].points - SHIPS[a.kind].points)[0];
  if (!target) return { turn: turnToward(state.bearing, 0), fire: false };
  const aim = leadOf(target) + (state.tick % 7) * 6 - 18;
  const on = Math.abs(aim - state.bearing) <= SHIPS[target.kind].half;
  return { turn: turnToward(state.bearing, aim), fire: on && !state.torpedo && Math.random() < 0.08 };
}

interface Live {
  mode: TorpedoMode;
  state: TorpedoState;
  seed: number;
  key: string;
  log: [number, TorpedoInput][];
  /** The input last written to the log. */
  last: TorpedoInput;
  /** The arrow keys and buttons held down. */
  left: boolean;
  right: boolean;
  /** Where a finger on the lens wants the sight, while it is there. */
  target: number | null;
  /** Fire was pressed since the last tick. */
  fire: boolean;
  /** When the last round ended (performance.now()). */
  stoppedAt: number;
}

const demoRun = (): Live => ({
  mode: "demo",
  state: Torpedo.createRun("standard", randomSeed()),
  seed: 0,
  key: "",
  log: [],
  last: Torpedo.INITIAL_INPUT,
  left: false,
  right: false,
  target: null,
  fire: false,
  stoppedAt: 0
});

export interface RunView {
  mode: TorpedoMode;
  state: TorpedoState;
}

// The periscope's clock, after Sputnik Catch's useArcadeRun: the rules are
// the engine's, this decides when the next tick comes and what the player is
// doing at that moment, logged as [tick, input] for the replay — one entry
// each time the input changes, so a press of fire is one entry with fire on
// and the next with it off. The run lives in a ref so a tick never reads a
// stale render. It pauses when the page is hidden, stops between rounds until
// the bonus round is fired in, and asks the screen to stay awake while on.
export function useTorpedoRun(onCues?: (cues: ArcadeCue[], mode: TorpedoMode, state: TorpedoState) => void) {
  const [first] = useState(demoRun);
  const live = useRef<Live>(first);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [view, setView] = useState<RunView>(() => ({ mode: first.mode, state: first.state }));
  const [best, setBest] = useState(loadBest);
  const bestRef = useRef(best);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const cuesRef = useRef(onCues);
  useEffect(() => {
    cuesRef.current = onCues;
  }, [onCues]);

  const publish = useCallback(() => setView({ mode: live.current.mode, state: live.current.state }), []);
  const stepRef = useRef<() => void>(() => undefined);
  // Ticks keep to the clock rather than to the timer: each is due a period
  // after the last was due, so the time a render takes is not added on, and a
  // timer that comes late (a slow phone, a throttled page) plays the ticks it
  // missed before the next render. A run that fell far behind starts afresh.
  const due = useRef(0);
  const schedule = useCallback((delay = 0) => {
    clearTimeout(timer.current);
    due.current = performance.now() + delay;
    timer.current = setTimeout(() => stepRef.current(), delay);
  }, []);

  /** One tick of the run. False when the clock stops: the run is over, or
   *  waits between rounds, or the demo started afresh. */
  const tickOnce = useCallback((): boolean => {
    const run = live.current;
    let input: TorpedoInput;
    if (run.mode === "demo") {
      input = autopilot(run.state);
    } else {
      const turn: TorpedoTurn = run.target !== null ? turnToward(run.state.bearing, run.target) : ((Number(run.right) - Number(run.left)) as TorpedoTurn);
      input = { turn, fire: run.fire };
      run.fire = false;
      if (input.turn !== run.last.turn || input.fire !== run.last.fire) {
        run.log.push([run.state.tick, input]);
        run.last = input;
      }
    }
    const { state, cues } = Torpedo.tick(run.state, input);
    run.state = state;
    cuesRef.current?.(cues, run.mode, state);
    if (state.over && run.mode === "demo") {
      live.current = demoRun();
      return false;
    }
    if (state.over) {
      run.mode = "over";
      run.stoppedAt = performance.now();
      const record = state.score > bestRef.current;
      if (record) {
        bestRef.current = state.score;
        saveBest(state.score);
        setBest(state.score);
      }
      setFinished({ key: run.key, variant: "standard", seed: run.seed, log: run.log, score: state.score, best: record });
      return false;
    }
    if (state.phase === "bonus" && run.mode === "play") {
      // The clock stops: nothing moves until the bonus round is fired in.
      run.mode = "bonus";
      run.stoppedAt = performance.now();
      run.left = run.right = false;
      run.target = null;
      return false;
    }
    return true;
  }, []);

  const step = useCallback(() => {
    const mode = live.current.mode;
    if (mode !== "play" && mode !== "demo") return;
    let going = true;
    for (let i = 0; going && i < MAX_CATCH_UP; i++) {
      going = tickOnce();
      due.current += Torpedo.TICK_MS;
      if (due.current > performance.now()) break;
    }
    if (live.current.mode === "demo" && !going) going = true;
    if (going) {
      const now = performance.now();
      if (due.current < now - 1000) due.current = now;
      timer.current = setTimeout(() => stepRef.current(), Math.max(0, due.current - now));
    }
    publish();
  }, [publish, tickOnce]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const start = useCallback(() => {
    const seed = randomSeed();
    live.current = { ...demoRun(), mode: "play", state: Torpedo.createRun("standard", seed), seed, key: newGameKey() };
    setFinished(null);
    schedule(START_DELAY);
    publish();
  }, [publish, schedule]);

  /** Fire: a torpedo in play, the bonus round between rounds, a new run otherwise. */
  const fire = useCallback(() => {
    const run = live.current;
    if ((run.mode === "bonus" || run.mode === "over") && performance.now() - run.stoppedAt < CARD_HOLD_MS) return;
    if (run.mode === "play") {
      run.fire = true;
    } else if (run.mode === "bonus") {
      run.mode = "play";
      run.fire = true;
      schedule(START_DELAY);
      publish();
    } else if (run.mode === "demo" || run.mode === "over") {
      start();
    }
  }, [publish, schedule, start]);

  /** A sight key or button going down or up. */
  const hold = useCallback((side: "left" | "right", down: boolean) => {
    const run = live.current;
    run[side] = down;
    if (down) run.target = null;
  }, []);

  /** A finger on the lens: the bearing it asks the sight to go to, or null when let go. */
  const aim = useCallback((bearing: number | null) => {
    live.current.target = bearing === null ? null : Math.max(-MAX_BEARING, Math.min(MAX_BEARING, Math.round(bearing)));
  }, []);

  const togglePause = useCallback(() => {
    const run = live.current;
    if (run.mode === "play") {
      run.mode = "paused";
      run.left = run.right = false;
      run.target = null;
      clearTimeout(timer.current);
    } else if (run.mode === "paused") {
      run.mode = "play";
      schedule(Torpedo.TICK_MS);
    } else {
      return;
    }
    publish();
  }, [publish, schedule]);

  // The demo starts at once; the timer goes with the page.
  useEffect(() => {
    schedule();
    return () => clearTimeout(timer.current);
  }, [schedule]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden && live.current.mode === "play") togglePause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [togglePause]);

  const playing = view.mode === "play";
  useEffect(() => {
    if (!playing || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    navigator.wakeLock.request("screen").then((sentinel) => {
      if (released) void sentinel.release();
      else lock = sentinel;
    }, () => undefined);
    return () => {
      released = true;
      void lock?.release();
    };
  }, [playing]);

  return { ...view, best, finished, start, fire, hold, aim, togglePause };
}
