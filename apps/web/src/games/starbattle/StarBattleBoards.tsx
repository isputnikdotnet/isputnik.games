import { useTranslation } from "react-i18next";
import { StarBattle, otherPlayer, type PlayerIndex, type StarBattleState, type ShotResult } from "@isputnik/games-engine";
import { SectorBoard, cellName } from "./SectorBoard";

// The two sectors as one player sees them: their own fleet with the other side's
// shots on it, and the enemy waters with their own shots and the vessels they
// have destroyed. The same for a local game (whole state, one side shown at a time)
// and an online match (the server's view for this seat).
export function StarBattleBoards({
  state,
  viewer,
  names,
  canFire,
  onFire,
  revealEnemy = false
}: {
  state: StarBattleState;
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
  const columns = t("starbattle.columns");
  const total = StarBattle.FLEETS[state.fleet].length;
  const mine = state.vessels[viewer] ?? [];
  const theirs = revealEnemy ? state.vessels[other] ?? [] : StarBattle.destroyedVessels(state, other);
  const last = state.lastShot;
  const open = (x: number, y: number) => state.shots[viewer][y * state.size + x] === StarBattle.UNKNOWN;

  return (
    <div className="star-boards">
      <figure className="star-figure is-enemy">
        <figcaption>
          <strong>{t("starbattle.sector.theirs", { name: names[other] })}</strong>
          <span className="muted">{t("starbattle.sector.intact", { count: total - state.destroyed[viewer] })}</span>
        </figcaption>
        <SectorBoard
          size={state.size}
          shots={state.shots[viewer]}
          vessels={theirs}
          kind="enemy"
          lastShot={last && last.by === viewer ? last : null}
          canTarget={canFire ? open : undefined}
          onCell={canFire ? (x, y) => open(x, y) && onFire(x, y) : undefined}
          columns={columns}
          label={t("starbattle.sector.enemyAria")}
        />
      </figure>
      <figure className="star-figure is-own">
        <figcaption>
          <strong>{t("starbattle.sector.yours", { name: names[viewer] })}</strong>
          <span className="muted">{t("starbattle.sector.intact", { count: total - state.destroyed[other] })}</span>
        </figcaption>
        <SectorBoard
          size={state.size}
          shots={state.shots[other]}
          vessels={mine}
          kind="own"
          lastShot={last && last.by === other ? last : null}
          columns={columns}
          label={t("starbattle.sector.ownAria")}
        />
      </figure>
    </div>
  );
}

/** "Dad: B4 — hit", the line under the status. */
export function lastShotLine(
  t: (key: "starbattle.status.last" | "starbattle.result.miss" | "starbattle.result.hit" | "starbattle.result.destroyed", options?: Record<string, unknown>) => string,
  columns: string,
  shot: { by: PlayerIndex; x: number; y: number; result: ShotResult },
  name: string
): string {
  const result = shot.result === "miss" ? t("starbattle.result.miss") : shot.result === "hit" ? t("starbattle.result.hit") : t("starbattle.result.destroyed");
  return t("starbattle.status.last", { player: name, cell: cellName(shot.x, shot.y, columns), result });
}
