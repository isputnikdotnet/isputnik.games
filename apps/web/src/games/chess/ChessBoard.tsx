import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Chess, type ChessMove, type ChessState, type PlayerIndex, type Promotion } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { ChessDefs, ChessPiece } from "./pieces";

const FILES = "abcdefgh";

/** How far a pressed piece must travel before it is being dragged, not tapped. */
const DRAG_SLOP = 6;

// The board: 64 squares, each a button, so it can be played by touch, mouse
// or keyboard and read out square by square. Tap a piece of the side this
// screen may move and the squares it can go to are marked; tap one to move.
// Or drag it: press a piece and carry it to a marked square. The piece
// follows the pointer and lands where it is let go (mouse, pen or finger).
// A pawn reaching the end asks what it becomes. The last move and a king in
// check are marked too, and a puzzle's hint. `orientation` is the seat at the bottom.
export function ChessBoard({
  state,
  orientation,
  movable,
  onMove,
  hint,
  unmarked = 0
}: {
  state: ChessState;
  orientation: PlayerIndex;
  /** The seat this screen may move now; null while nobody here may (their
   *  move, the computer thinking, the game over). */
  movable: PlayerIndex | null;
  onMove: (move: ChessMove) => void;
  /** A puzzle hint: the piece to move, and once asked twice where it goes. */
  hint?: { from: string; to?: string } | null;
  /** How many of the first moves are never marked as the last one — a
   *  puzzle's setup move, so the position opens clean. */
  unmarked?: number;
}) {
  const { t } = useTranslation();
  // A selection belongs to the position it was made in: once a move is played
  // (here or by the other side) it is gone without an effect to clear it.
  const at = state.moves.length;
  const [selection, setSelection] = useState<{ square: string; at: number } | null>(null);
  const [promoting, setPromoting] = useState<{ from: string; to: string; at: number } | null>(null);
  const selected = selection && selection.at === at && movable !== null ? selection.square : null;

  // A drag in progress: where it started, and once the pointer has moved far
  // enough, the piece lifted off its square and the square under the pointer.
  const press = useRef<{ square: string; pointerId: number; x: number; y: number; at: number } | null>(null);
  const [drag, setDrag] = useState<{ from: string; piece: string; over: string | null; size: number; x: number; y: number } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  // The click that follows a drop must not undo it (a tap on the start square).
  const dropped = useRef(false);
  const targets = useMemo(() => (selected ? Chess.targetsFrom(state, selected) : []), [state, selected]);

  const last = state.moves.length > unmarked ? state.moves[state.moves.length - 1] : null;
  const checked = state.check ? kingSquare(state, state.toMove) : null;

  const pieceName = (letter: string) => t(`chess.pieces.${Chess.ownerOf(letter) === 0 ? "white" : "black"}.${letter.toLowerCase() as "p" | "n" | "b" | "r" | "q" | "k"}`);

  const ranks = orientation === 0 ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 0 ? FILES.split("") : FILES.split("").reverse();

  const play = (from: string, to: string) => {
    setSelection(null);
    if (Chess.isPromotion(state, from, to)) setPromoting({ from, to, at });
    else onMove({ from, to });
  };

  const squareAt = (x: number, y: number): string | null => {
    const rect = board.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const column = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (column < 0 || column > 7 || row < 0 || row > 7) return null;
    return files[column] + ranks[row];
  };

  const endDrag = () => {
    press.current = null;
    setDrag(null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, square: string) => {
    if (movable === null || (event.pointerType === "mouse" && event.button !== 0)) return;
    const piece = Chess.pieceAt(state, square);
    if (!piece || Chess.ownerOf(piece) !== movable) return;
    // Not captured yet: a tap must still end in a click on its own square (a
    // captured pointer sends the click to the board instead). The moves reach
    // the board by bubbling until the press becomes a drag.
    press.current = { square, pointerId: event.pointerId, x: event.clientX, y: event.clientY, at };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = press.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (start.at !== at || movable === null) return endDrag();
    if (!drag) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_SLOP) return;
      const piece = Chess.pieceAt(state, start.square);
      const width = board.current?.getBoundingClientRect().width ?? 0;
      if (!piece) return endDrag();
      // Now it is a drag: follow the pointer even off the board, until it is let go.
      try {
        board.current?.setPointerCapture(event.pointerId);
      } catch {
        // An old browser or a test without pointer capture: moves still bubble to the board.
      }
      setSelection({ square: start.square, at });
      // jsdom measures nothing; a real board is never 0 wide.
      setDrag({ from: start.square, piece, over: squareAt(event.clientX, event.clientY), size: width / 8 || 48, x: event.clientX, y: event.clientY });
      return;
    }
    // The ghost moves by hand, not by a render per pointer event.
    if (ghost.current) ghost.current.style.transform = "translate(" + (event.clientX - drag.size / 2) + "px, " + (event.clientY - drag.size / 2) + "px)";
    const over = squareAt(event.clientX, event.clientY);
    if (over !== drag.over) setDrag({ ...drag, over, x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = press.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (drag) {
      dropped.current = true;
      window.setTimeout(() => { dropped.current = false; }, 0);
      const to = squareAt(event.clientX, event.clientY);
      if (start.at === at && to && to !== drag.from && Chess.targetsFrom(state, drag.from).includes(to)) play(drag.from, to);
      // Let go anywhere else and the piece goes home, still picked up.
    }
    endDrag();
  };

  // Escape puts a lifted piece back.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  const choose = (square: string) => {
    if (dropped.current) return;
    if (movable === null) return;
    if (selected && targets.includes(square)) {
      play(selected, square);
      return;
    }
    const piece = Chess.pieceAt(state, square);
    if (piece && Chess.ownerOf(piece) === movable && square !== selected) setSelection({ square, at });
    else setSelection(null);
  };

  return (
    <>
      <ChessDefs />
      <div
        ref={board}
        className={`chess-board${movable === null ? " is-idle" : ""}${drag ? " is-dragging" : ""}`}
        role="group"
        aria-label={t("chess.boardAria")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
        {ranks.map((rank, row) =>
          files.map((file, column) => {
            const square = `${file}${rank}`;
            const piece = Chess.pieceAt(state, square);
            // a1 is dark, h1 light ("light on the right"): with a = 0 and rank 1,
            // an odd sum is a dark square.
            const light = (FILES.indexOf(file) + rank) % 2 === 0;
            const target = targets.includes(square);
            const classes = [
              "chess-square",
              light ? "is-light" : "is-dark",
              square === selected && "is-selected",
              last && (square === last.from || square === last.to) && "is-last",
              square === checked && "is-check",
              hint && (square === hint.from || square === hint.to) && "is-hint",
              target && (piece ? "is-capture" : "is-target"),
              movable !== null && piece && Chess.ownerOf(piece) === movable && "is-own",
              drag && square === drag.from && "is-lifted",
              drag && square === drag.over && square !== drag.from && "is-over"
            ].filter(Boolean).join(" ");
            return (
              <Button
                key={square}
                variant="bare"
                className={classes}
                aria-label={piece ? t("chess.squareWith", { square, piece: pieceName(piece) }) : square}
                aria-pressed={square === selected}
                onClick={() => choose(square)}
                onPointerDown={(event) => onPointerDown(event, square)}
              >
                {column === 0 && <span className="chess-coord is-rank" aria-hidden="true">{rank}</span>}
                {row === 7 && <span className="chess-coord is-file" aria-hidden="true">{file}</span>}
                {piece && <ChessPiece letter={piece} />}
              </Button>
            );
          })
        )}
      </div>
      {drag && createPortal(
        <div
          ref={ghost}
          className="chess-ghost"
          style={{ width: drag.size, height: drag.size, transform: "translate(" + (drag.x - drag.size / 2) + "px, " + (drag.y - drag.size / 2) + "px)" }}
          aria-hidden="true"
        >
          <ChessPiece letter={drag.piece} />
        </div>,
        document.body
      )}
      {promoting && promoting.at === at && (
        <PromotionDialog
          white={state.toMove === 0}
          onPick={(promotion) => {
            setPromoting(null);
            onMove({ from: promoting.from, to: promoting.to, promotion });
          }}
          onClose={() => setPromoting(null)}
        />
      )}
    </>
  );
}

function PromotionDialog({ white, onPick, onClose }: { white: boolean; onPick: (promotion: Promotion) => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog title={t("chess.promote.title")} cancelLabel={t("chess.promote.cancel")} onClose={onClose}>
      <div className="chess-promotion">
        {Chess.PROMOTIONS.map((kind) => (
          <Button
            key={kind}
            variant="bare"
            className="chess-promotion-choice"
            aria-label={t(`chess.pieces.${white ? "white" : "black"}.${kind}`)}
            onClick={() => onPick(kind)}
          >
            <ChessPiece letter={white ? kind.toUpperCase() : kind} />
          </Button>
        ))}
      </div>
    </Dialog>
  );
}

function kingSquare(state: ChessState, seat: PlayerIndex): string | null {
  const index = state.board.indexOf(seat === 0 ? "K" : "k");
  return index < 0 ? null : `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;
}
