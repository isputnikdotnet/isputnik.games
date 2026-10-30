import { useTranslation } from "react-i18next";
import type { CheckersMove, CheckersState, PlayerIndex } from "@isputnik/games-engine";
import { CheckersBoard } from "./CheckersBoard";
import "../chess/theme";
export function CheckersTable({
  state,
  orientation,
  movable,
  onMove,
  names
}: {
  state: CheckersState;
  orientation: PlayerIndex;
  movable: PlayerIndex | null;
  onMove(move: CheckersMove): void;
  names: [string, string];
}) {
  const { t } = useTranslation();
  const strip = (seat: PlayerIndex) => (
    <div
      className={`chess-player is-${seat === 0 ? "white" : "black"}${state.status.kind === "playing" && state.status.turn === seat ? " is-active" : ""}`}
    >
      <span className="chess-player-pip" aria-hidden="true" />
      <span className="chess-player-name">{names[seat]}</span>
      <span className="checkers-remaining">
        {t("checkers.remaining", {
          count: state.board.filter((p) => p?.player === seat).length
        })}
      </span>
    </div>
  );
  return (
    <div className="chess-main">
      {strip(orientation === 0 ? 1 : 0)}
      <div className="chess-board-wrap">
        <CheckersBoard state={state} orientation={orientation} movable={movable} onMove={onMove} />
      </div>
      {strip(orientation)}
    </div>
  );
}
