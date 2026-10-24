import { useSyncExternalStore } from "react";

// The games' sounds, made on the spot with Web Audio rather than shipped as
// files: a soft wooden tick for a dot, a laser and a blast in space, a chime
// when the move comes back to you, a handheld's piezo beeps for Sputnik Catch. Nothing plays until the player has touched
// the page once (browsers keep an AudioContext silent until then), and nothing
// at all while the top bar's switch says off — remembered per device, since
// whether a phone beeps is the person's own business.
export type Cue =
  | "dot" | "dotTheirs" | "capture" | "captured" | "lost"
  | "take" | "check"
  | "drawTile"
  | "deploy" | "fire" | "miss" | "hit" | "destroyed"
  | "lcdStep0" | "lcdStep1" | "lcdStep2" | "lcdStep3"
  | "lcdCatch" | "lcdCrash" | "lcdAlien" | "lcdPardon" | "lcdStart" | "lcdOver"
  | "yourMove" | "message" | "invite" | "win" | "lose" | "draw";

const STORAGE_KEY = "isputnik-games-sound";
const VOLUME = 0.3;

// ── The switch ──────────────────────────────────────────────────────────────

let enabled = readEnabled();
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    /* private mode: the switch holds for this visit */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, soundEnabled, soundEnabled);
}

// ── The context, opened by the first touch ─────────────────────────────────

let context: AudioContext | null = null;
let master: GainNode | null = null;

function unlock() {
  const Ctor = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!Ctor) return;
  if (!context) {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = VOLUME;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
}

if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

// ── Building blocks ────────────────────────────────────────────────────────

interface Tone {
  type?: OscillatorType;
  freq: number;
  /** Glides to this pitch over the tone. */
  to?: number;
  at: number;
  dur: number;
  gain?: number;
}

function tone(ctx: AudioContext, out: AudioNode, { type = "sine", freq, to, at, dur, gain = 0.6 }: Tone) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

interface Noise {
  at: number;
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq: number;
  to?: number;
}

function noise(ctx: AudioContext, out: AudioNode, { at, dur, gain = 0.5, filter = "lowpass", freq, to }: Noise) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.frequency.setValueAtTime(freq, at);
  if (to !== undefined) shape.frequency.exponentialRampToValueAtTime(to, at + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  source.connect(shape).connect(env).connect(out);
  source.start(at);
  source.stop(at + dur + 0.02);
}

function notes(ctx: AudioContext, out: AudioNode, at: number, freqs: number[], step: number, dur: number, type: OscillatorType = "sine", gain = 0.5) {
  freqs.forEach((freq, i) => tone(ctx, out, { type, freq, at: at + i * step, dur: i === freqs.length - 1 ? dur * 2 : dur, gain }));
}

/** A square wave is loud for its gain: the handheld's beeps sit well under the rest. */
const LCD_GAIN = 0.16;

function lcdBeep(ctx: AudioContext, out: AudioNode, at: number, freq: number, dur = 0.03): number {
  tone(ctx, out, { type: "square", freq, at, dur, gain: LCD_GAIN });
  return dur;
}

// ── The cues: each draws itself from `at` and says how long it lasts ───────

const cues: Record<Cue, (ctx: AudioContext, out: AudioNode, at: number) => number> = {
  dot: (ctx, out, at) => {
    tone(ctx, out, { type: "triangle", freq: 920, to: 640, at, dur: 0.09, gain: 0.7 });
    return 0.09;
  },
  dotTheirs: (ctx, out, at) => {
    tone(ctx, out, { type: "triangle", freq: 680, to: 470, at, dur: 0.09, gain: 0.6 });
    return 0.09;
  },
  capture: (ctx, out, at) => {
    notes(ctx, out, at, [660, 880, 1175], 0.07, 0.12);
    return 0.35;
  },
  captured: (ctx, out, at) => {
    notes(ctx, out, at, [440, 370, 294], 0.09, 0.14, "triangle");
    return 0.45;
  },
  lost: (ctx, out, at) => {
    tone(ctx, out, { type: "triangle", freq: 300, to: 160, at, dur: 0.25, gain: 0.5 });
    return 0.25;
  },
  take: (ctx, out, at) => {
    tone(ctx, out, { type: "triangle", freq: 520, to: 260, at, dur: 0.12, gain: 0.8 });
    noise(ctx, out, { at, dur: 0.08, gain: 0.25, filter: "bandpass", freq: 1800, to: 700 });
    return 0.12;
  },
  check: (ctx, out, at) => {
    notes(ctx, out, at + 0.05, [988, 988], 0.09, 0.06, "square", 0.12);
    return 0.3;
  },
  drawTile: (ctx, out, at) => {
    // A tile slid off the pile: a short dry scrape.
    noise(ctx, out, { at, dur: 0.07, gain: 0.3, filter: "bandpass", freq: 2200, to: 1100 });
    return 0.07;
  },
  deploy: (ctx, out, at) => {
    tone(ctx, out, { type: "sawtooth", freq: 140, to: 520, at, dur: 0.3, gain: 0.12 });
    noise(ctx, out, { at, dur: 0.3, gain: 0.15, filter: "bandpass", freq: 400, to: 2400 });
    return 0.3;
  },
  fire: (ctx, out, at) => {
    tone(ctx, out, { type: "square", freq: 1500, to: 260, at, dur: 0.13, gain: 0.18 });
    return 0.14;
  },
  miss: (ctx, out, at) => {
    noise(ctx, out, { at, dur: 0.3, gain: 0.18, freq: 900, to: 180 });
    return 0.3;
  },
  hit: (ctx, out, at) => {
    noise(ctx, out, { at, dur: 0.25, gain: 0.6, filter: "bandpass", freq: 1400, to: 500 });
    tone(ctx, out, { freq: 130, to: 60, at, dur: 0.25, gain: 0.7 });
    return 0.25;
  },
  destroyed: (ctx, out, at) => {
    noise(ctx, out, { at, dur: 0.9, gain: 0.8, freq: 2400, to: 90 });
    tone(ctx, out, { freq: 95, to: 32, at, dur: 0.8, gain: 0.9 });
    return 0.9;
  },
  // The LCD handheld's piezo: plain square beeps, each rail its own pitch.
  lcdStep0: (ctx, out, at) => lcdBeep(ctx, out, at, 1046),
  lcdStep1: (ctx, out, at) => lcdBeep(ctx, out, at, 880),
  lcdStep2: (ctx, out, at) => lcdBeep(ctx, out, at, 784),
  lcdStep3: (ctx, out, at) => lcdBeep(ctx, out, at, 659),
  lcdCatch: (ctx, out, at) => lcdBeep(ctx, out, at, 1568, 0.05),
  lcdCrash: (ctx, out, at) => lcdBeep(ctx, out, at, 330, 0.16),
  lcdAlien: (ctx, out, at) => lcdBeep(ctx, out, at, 523, 0.1),
  lcdPardon: (ctx, out, at) => {
    notes(ctx, out, at, [784, 988, 1175, 1568], 0.09, 0.08, "square", LCD_GAIN);
    return 0.45;
  },
  lcdStart: (ctx, out, at) => {
    notes(ctx, out, at, [523, 659, 784], 0.08, 0.07, "square", LCD_GAIN);
    return 0.3;
  },
  lcdOver: (ctx, out, at) => {
    notes(ctx, out, at, [392, 330, 262, 196], 0.2, 0.18, "square", LCD_GAIN);
    return 1;
  },
  yourMove: (ctx, out, at) => {
    notes(ctx, out, at, [784, 1046], 0.13, 0.25);
    return 0.6;
  },
  message: (ctx, out, at) => {
    tone(ctx, out, { freq: 990, to: 1320, at, dur: 0.08, gain: 0.4 });
    return 0.1;
  },
  invite: (ctx, out, at) => {
    notes(ctx, out, at, [523, 659, 784], 0.11, 0.2);
    return 0.65;
  },
  win: (ctx, out, at) => {
    notes(ctx, out, at, [523, 659, 784, 1046], 0.11, 0.22, "triangle", 0.6);
    return 0.8;
  },
  lose: (ctx, out, at) => {
    notes(ctx, out, at, [392, 349, 294], 0.22, 0.3, "triangle", 0.5);
    return 1;
  },
  draw: (ctx, out, at) => {
    notes(ctx, out, at, [587, 587], 0.18, 0.25, "triangle", 0.5);
    return 0.7;
  }
};

// A short buzz on a phone for what matters even with the sound down.
const buzz: Partial<Record<Cue, number[]>> = {
  yourMove: [35],
  invite: [35, 60, 35],
  destroyed: [60, 40, 60],
  lcdCrash: [40]
};

/** Plays the cues one after another. A no-op while switched off, before the
 *  first touch, and in a browser without Web Audio (the tests). */
export function play(...sequence: Cue[]): void {
  if (!enabled || sequence.length === 0) return;
  for (const cue of sequence) {
    const pattern = buzz[cue];
    if (pattern) navigator.vibrate?.(pattern);
  }
  if (!context || !master || context.state !== "running") return;
  let at = context.currentTime + 0.01;
  for (const cue of sequence) at += cues[cue](context, master, at) + 0.02;
}
