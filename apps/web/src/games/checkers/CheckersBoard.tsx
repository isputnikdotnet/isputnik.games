import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkers, type CheckersMove, type CheckersState, type PlayerIndex } from "@isputnik/games-engine";

export function CheckersBoard({
  state,
  movable,
  orientation = 0,
  onMove
}: {
  state: CheckersState;
  movable: PlayerIndex | null;
  orientation?: PlayerIndex;
  onMove(move: CheckersMove): void;
}) {
  const { t } = useTranslation();
  // A changed position remounts the path selector, including after undo/online updates.
  return (
    <PositionBoard
      key={`${state.moves.length}:${state.board.map((p) => (p ? `${p.player}${p.king}` : ".")).join("")}:${state.status.kind}`}
      state={state}
      movable={movable}
      orientation={orientation}
      onMove={onMove}
      label={t("checkers.board")}
    />
  );
}
function PositionBoard({
  state,
  movable,
  orientation,
  onMove,
  label
}: {
  state: CheckersState;
  movable: PlayerIndex | null;
  orientation: PlayerIndex;
  onMove(move: CheckersMove): void;
  label: string;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState<number[]>([]);
  const moves =
    movable !== null && state.status.kind === "playing" && movable === state.status.turn
      ? Checkers.legalMoves(state)
      : [];
  const candidates = moves.filter((m) => path.every((sq, i) => sq === m.path[i]));
  const destinations = new Set(path.length ? candidates.map((m) => m.path[path.length]) : []);
  const source = path[0];
  const board = [...state.board];
  if (path.length > 1 && source !== undefined) {
    const piece = board[source]!;
    board[source] = null;
    board[path[path.length - 1]!] = {
      ...piece,
      king: piece.king || path.some((s) => Math.floor(s / 8) === (piece.player === 0 ? 0 : 7))
    };
  }
  const choose = (square: number) => {
    if (destinations.has(square)) {
      const next = [...path, square];
      const complete = candidates.find((m) => m.path.length === next.length && next.every((sq, i) => sq === m.path[i]));
      if (complete) {
        setPath([]);
        onMove(complete);
      } else setPath(next);
    } else if (path.length <= 1 && moves.some((m) => m.path[0] === square)) setPath([square]);
    else if (path.length <= 1) setPath([]);
  };
  return (
    <div className="checkers-table">
      <div className="checkers-board" role="group" aria-label={label}>
        {Array.from({ length: 64 }, (_, n) => (orientation === 0 ? n : 63 - n)).map((square) => {
          const piece = board[square],
            dark = (Math.floor(square / 8) + (square % 8)) % 2 === 1;
          const target = destinations.has(square);
          const active = path[path.length - 1] === square;
          const last = state.moves[state.moves.length - 1]?.path.includes(square);
          const pieceLabel = piece
            ? t(piece.king ? "checkers.king" : "checkers.man", {
                player: t(piece.player === 0 ? "checkers.white" : "checkers.black")
              })
            : t("checkers.empty");
          return (
            <button
              key={square}
              type="button"
              className={`checkers-square ${dark ? "is-dark" : "is-light"}${target ? " is-target" : ""}${active ? " is-active" : ""}${last ? " is-last" : ""}`}
              aria-label={`${Checkers.squareName(square)}, ${pieceLabel}${target ? `, ${t("checkers.destination")}` : ""}`}
              aria-pressed={active}
              disabled={!dark || !moves.length}
              onClick={() => choose(square)}
            >
              <span className="checkers-coordinate" aria-hidden="true">
                {Checkers.squareName(square)}
              </span>
              {piece && (
                <span
                  aria-hidden="true"
                  className={`checkers-piece is-${piece.player === 0 ? "white" : "black"}${piece.king ? " is-king" : ""}`}
                >
                  {piece.king ? "♛" : ""}
                </span>
              )}
              {target && <span className="checkers-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="checkers-hint" role="status">
        {path.length > 1
          ? t("checkers.continue")
          : path.length
            ? t("checkers.chooseLanding")
            : t("checkers.choosePiece")}
      </p>
      {path.length > 0 && (
        <button className="text-button" onClick={() => setPath([])}>
          {t("checkers.cancelSelection")}
        </button>
      )}
    </div>
  );
}
