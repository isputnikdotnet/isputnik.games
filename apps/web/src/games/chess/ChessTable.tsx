import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chess, type ChessMove, type ChessState, type PlayerIndex } from "@isputnik/games-engine";
import { ChessBoard } from "./ChessBoard";
import { ChessPiece } from "./pieces";

// The table both chess pages lay out: the board between the two players —
// the one at the bottom is the side the board faces — and beside it (below it
// on a narrow screen) the page's own panel: the status, the buttons, Comms.
// Each player's strip lights while it is their move and shows what they have
// taken, with the material lead in pawns.
export function ChessTable({
  state,
  orientation,
  movable,
  onMove,
  names,
  children
}: {
  state: ChessState;
  orientation: PlayerIndex;
  movable: PlayerIndex | null;
  onMove: (move: ChessMove) => void;
  names: [string, string];
  children: ReactNode;
}) {
  const { taken, points } = Chess.material(state);
  const turn = state.status.kind === "playing" ? state.status.turn : null;
  const strip = (seat: PlayerIndex) => (
    <PlayerStrip
      seat={seat}
      name={names[seat]}
      taken={taken[seat]}
      lead={points[seat] - points[seat === 0 ? 1 : 0]}
      active={turn === seat}
    />
  );
  return (
    <div className="chess-layout">
      <div className="chess-main">
        {strip(orientation === 0 ? 1 : 0)}
        <div className="chess-board-wrap">
          <ChessBoard state={state} orientation={orientation} movable={movable} onMove={onMove} />
        </div>
        {strip(orientation)}
      </div>
      <aside className="chess-side">{children}</aside>
    </div>
  );
}

const ORDER = "qrbnp";

function PlayerStrip({ seat, name, taken, lead, active }: { seat: PlayerIndex; name: string; taken: string; lead: number; active: boolean }) {
  const { t } = useTranslation();
  // What White took are Black's pieces, drawn black; and the other way round.
  const pieces = taken.split("").sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return (
    <div className={`chess-player is-${seat === 0 ? "white" : "black"}${active ? " is-active" : ""}`}>
      <span className="chess-player-pip" aria-hidden="true" />
      <span className="chess-player-name">{name}</span>
      <span className="chess-taken" aria-label={t("chess.taken")}>
        {pieces.map((kind, i) => <ChessPiece key={i} letter={seat === 0 ? kind : kind.toUpperCase()} />)}
      </span>
      {lead > 0 && <span className="chess-lead">+{lead}</span>}
    </div>
  );
}
