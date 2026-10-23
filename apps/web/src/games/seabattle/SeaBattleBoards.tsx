import { useTranslation } from "react-i18next";
import { SeaBattle, otherPlayer, type PlayerIndex, type SeaBattleState, type ShotResult } from "@isputnik/games-engine";
import { SeaBoard, cellName } from "./SeaBoard";

// The two seas as one player sees them: their own fleet with the other side's
// shots on it, and the enemy waters with their own shots and the ships they
// have sunk. The same for a local game (whole state, one side shown at a time)
// and an online match (the server's view for this seat).
export function SeaBattleBoards({
  state,
  viewer,
  names,
  canFire,
  onFire,
  revealEnemy = false
}: {
  state: SeaBattleState;
  viewer: PlayerIndex;
  /** The two seats' names, for the captions. */
  names: [string, string];
  canFire: boolean;
  onFire: (x: number, y: number) => void;
  /** After a local game: show the other fleet whole. */
  revealEnemy?: boolean;
}) {
  const { t } = useTranslation();
  const other = otherPlayer(viewer);
  const columns = t("seabattle.columns");
  const total = SeaBattle.FLEETS[state.fleet].length;
  const mine = state.ships[viewer] ?? [];
  const theirs = revealEnemy ? state.ships[other] ?? [] : SeaBattle.sunkShips(state, other);
  const last = state.lastShot;
  const open = (x: number, y: number) => state.shots[viewer][y * state.size + x] === SeaBattle.UNKNOWN;

  return (
    <div className="sea-boards">
      <figure className="sea-figure is-enemy">
        <figcaption>
          <strong>{t("seabattle.sea.theirs", { name: names[other] })}</strong>
          <span className="muted">{t("seabattle.sea.afloat", { count: total - state.sunk[viewer] })}</span>
        </figcaption>
        <SeaBoard
          size={state.size}
          shots={state.shots[viewer]}
          ships={theirs}
          kind="enemy"
          lastShot={last && last.by === viewer ? last : null}
          canTarget={canFire ? open : undefined}
          onCell={canFire ? (x, y) => open(x, y) && onFire(x, y) : undefined}
          columns={columns}
          label={t("seabattle.sea.enemyAria")}
        />
      </figure>
      <figure className="sea-figure is-own">
        <figcaption>
          <strong>{t("seabattle.sea.yours", { name: names[viewer] })}</strong>
          <span className="muted">{t("seabattle.sea.afloat", { count: total - state.sunk[other] })}</span>
        </figcaption>
        <SeaBoard
          size={state.size}
          shots={state.shots[other]}
          ships={mine}
          kind="own"
          lastShot={last && last.by === other ? last : null}
          columns={columns}
          label={t("seabattle.sea.ownAria")}
        />
      </figure>
    </div>
  );
}

/** "Dad: B4 — hit", the line under the status. */
export function lastShotLine(
  t: (key: "seabattle.status.last" | "seabattle.result.miss" | "seabattle.result.hit" | "seabattle.result.sunk", options?: Record<string, unknown>) => string,
  columns: string,
  shot: { by: PlayerIndex; x: number; y: number; result: ShotResult },
  name: string
): string {
  const result = shot.result === "miss" ? t("seabattle.result.miss") : shot.result === "hit" ? t("seabattle.result.hit") : t("seabattle.result.sunk");
  return t("seabattle.status.last", { player: name, cell: cellName(shot.x, shot.y, columns), result });
}
