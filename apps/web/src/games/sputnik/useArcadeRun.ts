import { useCallback, useEffect, useRef, useState } from "react";
import { Sputnik, type ArcadeCue, type SputnikRail, type SputnikState, type SputnikVariant } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";
import { autopilot, type HandheldMode } from "./lit";

/** How long every segment shows when the handheld is switched on, and the
 *  breath between pressing Game A or B and the first tick. */
export const HANDHELD_DELAYS = { test: 900, start: 500 };
/** The blink of half an alien and of the robot at the end. */
export const BLINK_MS = 280;

const BEST_KEY = "isputnik-games.sputnik.best";

export type Best = Record<SputnikVariant, number>;

/** A finished run as the server will want it (step 4): enough to replay it. */
export interface FinishedRun {
  key: string;
  variant: SputnikVariant;
  seed: number;
  log: [number, SputnikRail][];
  caught: number;
  /** A new best on this device. */
  best: boolean;
}

export function loadBest(): Best {
  try {
    const saved = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Partial<Best>;
    return { A: Number(saved.A) || 0, B: Number(saved.B) || 0 };
  } catch {
    return { A: 0, B: 0 };
  }
}

function saveBest(best: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
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

interface Live {
  mode: HandheldMode;
  state: SputnikState;
  net: SputnikRail;
  seed: number;
  key: string;
  log: [number, SputnikRail][];
}

/** What a render needs of the run. */
export interface RunView {
  mode: HandheldMode;
  state: SputnikState;
  net: SputnikRail;
}

const demoRun = (mode: HandheldMode = "demo"): Live => ({
  mode,
  state: Sputnik.createRun("A", randomSeed()),
  net: 0,
  seed: 0,
  key: "",
  log: []
});

const viewOf = (run: Live): RunView => ({ mode: run.mode, state: run.state, net: run.net });

// The handheld's clock. The rules are the engine's; this decides when the next
// tick comes (the engine's periodOf), what the net is at that moment, and what
// the player did, logged as [tick, net] for the replay. The run lives in a ref
// so a tick never reads a stale render, and is copied into state after every
// change for the render to read. A run pauses when the page is hidden, and
// asks the screen to stay awake while it is on.
export function useArcadeRun(onCues?: (cues: ArcadeCue[], mode: HandheldMode) => void) {
  const [switchedOn] = useState(() => demoRun("test"));
  const live = useRef<Live>(switchedOn);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [view, setView] = useState<RunView>(() => viewOf(switchedOn));
  const [blink, setBlink] = useState(false);
  const [best, setBest] = useState<Best>(loadBest);
  const bestRef = useRef(best);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const cuesRef = useRef(onCues);
  useEffect(() => {
    cuesRef.current = onCues;
  }, [onCues]);

  const publish = useCallback(() => setView(viewOf(live.current)), []);
  const stepRef = useRef<() => void>(() => undefined);

  const schedule = useCallback((delay?: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => stepRef.current(), delay ?? Sputnik.periodOf(live.current.state));
  }, []);

  const step = useCallback(() => {
    const run = live.current;
    if (run.mode !== "play" && run.mode !== "demo") return;
    if (run.mode === "demo") run.net = autopilot(run.state, run.net);
    const { state, cues } = Sputnik.tick(run.state, run.net);
    run.state = state;
    cuesRef.current?.(cues, run.mode);
    if (state.over && run.mode === "demo") {
      live.current = demoRun();
      schedule();
    } else if (state.over) {
      run.mode = "over";
      const variant = state.variant;
      const record = state.caught > bestRef.current[variant];
      if (record) {
        bestRef.current = { ...bestRef.current, [variant]: state.caught };
        saveBest(bestRef.current);
        setBest(bestRef.current);
      }
      setFinished({ key: run.key, variant, seed: run.seed, log: run.log, caught: state.caught, best: record });
    } else {
      schedule();
    }
    publish();
  }, [publish, schedule]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const start = useCallback((variant: SputnikVariant) => {
    const seed = randomSeed();
    live.current = { mode: "play", state: Sputnik.createRun(variant, seed), net: 0, seed, key: newGameKey(), log: [] };
    setFinished(null);
    schedule(HANDHELD_DELAYS.start);
    publish();
  }, [publish, schedule]);

  const move = useCallback((rail: SputnikRail) => {
    const run = live.current;
    if (run.mode !== "play" || run.net === rail) return;
    run.net = rail;
    // The net in effect at the next tick: of two presses before it, the last counts.
    const last = run.log[run.log.length - 1];
    if (last && last[0] === run.state.tick) last[1] = rail;
    else run.log.push([run.state.tick, rail]);
    publish();
  }, [publish]);

  const togglePause = useCallback(() => {
    const run = live.current;
    if (run.mode === "play") {
      run.mode = "paused";
      clearTimeout(timer.current);
    } else if (run.mode === "paused") {
      run.mode = "play";
      schedule();
    } else {
      return;
    }
    publish();
  }, [publish, schedule]);

  // Switched on: every segment for a moment, then the demo.
  useEffect(() => {
    const on = setTimeout(() => {
      if (live.current.mode !== "test") return;
      live.current = demoRun();
      schedule();
      publish();
    }, HANDHELD_DELAYS.test);
    return () => {
      clearTimeout(on);
      clearTimeout(timer.current);
    };
  }, [publish, schedule]);

  useEffect(() => {
    const id = setInterval(() => setBlink((on) => !on), BLINK_MS);
    return () => clearInterval(id);
  }, []);

  // A hidden page would keep ticking unseen: the run waits for the player.
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

  return { ...view, blink, best, finished, start, move, togglePause };
}
