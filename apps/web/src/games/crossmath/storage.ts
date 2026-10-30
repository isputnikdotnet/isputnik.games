import { Crossmath, type CrossmathLevel, type CrossmathPlay } from "@isputnik/games-engine";

// Crossmath plays on this device: which level is open and which puzzle in each,
// whether the clock shows, and for every puzzle touched its tiles, hints and
// time — so moving to another puzzle and back loses nothing. A solve also goes
// to the server, which keeps the member's results and rating; one that could not
// be sent stays unreported here and goes when the page next opens.

export interface PuzzleProgress {
  play: CrossmathPlay;
  /** Seconds the puzzle has been open and in view. */
  elapsed: number;
  /** Hints taken, including one whose tile was since taken back. */
  hintsUsed: number;
  solved: boolean;
  /** The server has this solve. */
  reported: boolean;
}

export interface CrossmathSave {
  level: CrossmathLevel;
  /** The clock always counts; this only takes it off the screen. */
  clockHidden: boolean;
  /** The puzzle number open in each level, from 1. */
  current: Partial<Record<CrossmathLevel, number>>;
  /** By puzzle id ("easy-3"). */
  puzzles: Record<string, PuzzleProgress>;
}

const KEY = "isputnik-games.crossmath";

export const DEFAULT_SAVE: CrossmathSave = { level: "easy", clockHidden: false, current: {}, puzzles: {} };

const ID = /^(easy|medium|hard|expert)-(\d+)$/;

function parseProgress(id: string, input: unknown): PuzzleProgress | null {
  const match = ID.exec(id);
  const value = input as Partial<PuzzleProgress> | null;
  if (!match || !value) return null;
  const level = match[1] as CrossmathLevel;
  const number = Number(match[2]);
  if (number < 1 || number > Crossmath.puzzleCount(level)) return null;
  try {
    const play = Crossmath.parsePlay(Crossmath.puzzleOf(level, number), value.play);
    const elapsed = Number.isInteger(value.elapsed) && value.elapsed! >= 0 ? value.elapsed! : 0;
    const hintsUsed = Number.isInteger(value.hintsUsed) && value.hintsUsed! >= play.hinted.length ? value.hintsUsed! : play.hinted.length;
    return { play, elapsed, hintsUsed, solved: value.solved === true, reported: value.reported === true };
  } catch {
    return null;
  }
}

export function loadCrossmath(): CrossmathSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<CrossmathSave> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_SAVE;
    const current: CrossmathSave["current"] = {};
    for (const level of Crossmath.LEVELS) {
      const number = raw.current?.[level];
      if (Number.isInteger(number) && number! >= 1 && number! <= Crossmath.puzzleCount(level)) current[level] = number;
    }
    const puzzles: CrossmathSave["puzzles"] = {};
    for (const [id, value] of Object.entries(raw.puzzles ?? {})) {
      const progress = parseProgress(id, value);
      if (progress) puzzles[id] = progress;
    }
    return { level: Crossmath.isLevel(raw.level) ? raw.level : "easy", clockHidden: raw.clockHidden === true, current, puzzles };
  } catch {
    return DEFAULT_SAVE;
  }
}

export function saveCrossmath(save: CrossmathSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode: the puzzle holds for this visit */
  }
}

/** Whether a puzzle is under way on this device: tiles down and not yet solved. */
export function crossmathInProgress(): boolean {
  return Object.values(loadCrossmath().puzzles).some((progress) => !progress.solved && progress.play.cells.some((tile) => tile !== null));
}
