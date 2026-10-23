import { useTranslation } from "react-i18next";
import { StarBattle, otherPlayer, type PlayerIndex, type StarBattleState, type ShotResult } from "@isputnik/games-engine";
import { SectorBoard, cellName } from "./SectorBoard";

// The two sectors as one player sees them, each in its panel: their own fleet
// with the other side's shots on it, and the enemy sector with their own shots
// and the craft they have destroyed. Each panel says how much of that fleet
// is still intact, in words and as a row of pips.
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
    <div className="arena-boards">
      <section className="arena-panel is-enemy" aria-label={t("starbattle.sector.enemyAria")}>
        <header className="arena-panel-head">
          <h2>{t("starbattle.sector.theirs", { name: names[other] })}</h2>
          <Intact intact={total - state.destroyed[viewer]} total={total} tone="them" />
        </header>
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
      </section>
      <section className="arena-panel is-own" aria-label={t("starbattle.sector.ownAria")}>
        <header className="arena-panel-head">
          <h2>{t("starbattle.sector.yours", { name: names[viewer] })}</h2>
          <Intact intact={total - state.destroyed[other]} total={total} tone="you" />
        </header>
        <SectorBoard
          size={state.size}
          shots={state.shots[other]}
          vessels={mine}
          kind="own"
          lastShot={last && last.by === other ? last : null}
          columns={columns}
          label={t("starbattle.sector.ownAria")}
        />
      </section>
    </div>
  );
}

function Intact({ intact, total, tone }: { intact: number; total: number; tone: "you" | "them" }) {
  const { t } = useTranslation();
  return (
    <span className={`arena-intact is-${tone}`}>
      <span>{t("starbattle.arena.intact", { count: intact, total })}</span>
      <span className="arena-pips" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={`arena-pip${i < intact ? " is-lit" : ""}`} />)}
      </span>
    </span>
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
