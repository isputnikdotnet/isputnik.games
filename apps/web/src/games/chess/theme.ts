import { useSyncExternalStore } from "react";

// The look of the chess board and its pieces, from the plainest to the
// richest. A theme is only a set of colours (and for Walnut some shading) in
// chess.css under :root[data-chess-theme=…], so it reaches every board on the
// page — the game, the taken pieces, the lobby's preview — without a prop.
// Remembered per device, like the sound switch: a small phone may want Mono
// where the family computer wears Walnut.
export const CHESS_THEMES = ["mono", "classic", "green", "slate", "walnut"] as const;
export type ChessTheme = (typeof CHESS_THEMES)[number];

const STORAGE_KEY = "isputnik-games-chess-theme";
const DEFAULT: ChessTheme = "classic";

let current = readTheme();
const listeners = new Set<() => void>();
apply(current);

function readTheme(): ChessTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CHESS_THEMES.includes(saved as ChessTheme) ? (saved as ChessTheme) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function apply(theme: ChessTheme) {
  if (typeof document !== "undefined") document.documentElement.dataset.chessTheme = theme;
}

export function chessTheme(): ChessTheme {
  return current;
}

export function setChessTheme(theme: ChessTheme): void {
  current = theme;
  apply(theme);
  try {
    if (theme === DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: the theme holds for this visit */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChessTheme(): ChessTheme {
  return useSyncExternalStore(subscribe, chessTheme, chessTheme);
}
