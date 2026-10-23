import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chess, type ChessMove, type ChessState, type PlayerIndex, type Promotion } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { ChessPiece } from "./pieces";

const FILES = "abcdefgh";

// The board: 64 squares, each a button, so it can be played by touch, mouse
// or keyboard and read out square by square. Tap a piece of the side this
// screen may move and the squares it can go to are marked; tap one to move.
// A pawn reaching the end asks what it becomes. The last move and a king in
// check are marked too. `orientation` is the seat at the bottom.
export function ChessBoard({
  state,
  orientation,
  movable,
  onMove
}: {
  state: ChessState;
  orientation: PlayerIndex;
  /** The seat this screen may move now; null while nobody here may (their
   *  move, the computer thinking, the game over). */
  movable: PlayerIndex | null;
  onMove: (move: ChessMove) => void;
}) {
  const { t } = useTranslation();
  // A selection belongs to the position it was made in: once a move is played
  // (here or by the other side) it is gone without an effect to clear it.
  const at = state.moves.length;
  const [selection, setSelection] = useState<{ square: string; at: number } | null>(null);
  const [promoting, setPromoting] = useState<{ from: string; to: string; at: number } | null>(null);
  const selected = selection && selection.at === at && movable !== null ? selection.square : null;
  const targets = useMemo(() => (selected ? Chess.targetsFrom(state, selected) : []), [state, selected]);

  const last = state.moves.length ? state.moves[state.moves.length - 1] : null;
  const checked = state.check ? kingSquare(state, state.toMove) : null;

  const pieceName = (letter: string) => t(`chess.pieces.${Chess.ownerOf(letter) === 0 ? "white" : "black"}.${letter.toLowerCase() as "p" | "n" | "b" | "r" | "q" | "k"}`);

  const choose = (square: string) => {
    if (movable === null) return;
    if (selected && targets.includes(square)) {
      setSelection(null);
      if (Chess.isPromotion(state, selected, square)) setPromoting({ from: selected, to: square, at });
      else onMove({ from: selected, to: square });
      return;
    }
    const piece = Chess.pieceAt(state, square);
    if (piece && Chess.ownerOf(piece) === movable && square !== selected) setSelection({ square, at });
    else setSelection(null);
  };

  const ranks = orientation === 0 ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 0 ? FILES.split("") : FILES.split("").reverse();

  return (
    <>
      <div
        className={`chess-board${movable === null ? " is-idle" : ""}`}
        role="group"
        aria-label={t("chess.boardAria")}
      >
        {ranks.map((rank, row) =>
          files.map((file, column) => {
            const square = `${file}${rank}`;
            const piece = Chess.pieceAt(state, square);
            const light = (FILES.indexOf(file) + rank) % 2 === 1;
            const target = targets.includes(square);
            const classes = [
              "chess-square",
              light ? "is-light" : "is-dark",
              square === selected && "is-selected",
              last && (square === last.from || square === last.to) && "is-last",
              square === checked && "is-check",
              target && (piece ? "is-capture" : "is-target")
            ].filter(Boolean).join(" ");
            return (
              <Button
                key={square}
                variant="bare"
                className={classes}
                aria-label={piece ? t("chess.squareWith", { square, piece: pieceName(piece) }) : square}
                aria-pressed={square === selected}
                onClick={() => choose(square)}
              >
                {column === 0 && <span className="chess-coord is-rank" aria-hidden="true">{rank}</span>}
                {row === 7 && <span className="chess-coord is-file" aria-hidden="true">{file}</span>}
                {piece && <ChessPiece letter={piece} />}
              </Button>
            );
          })
        )}
      </div>
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
