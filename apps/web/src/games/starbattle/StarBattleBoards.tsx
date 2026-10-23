import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StarBattle, otherPlayer, type PlayerIndex, type StarBattleState, type ShotResult } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { PHONE_ARENA, useMediaQuery } from "../../shared/useMediaQuery";
import { SectorBoard, cellName } from "./SectorBoard";

type Side = "own" | "enemy";

// The two sectors as one player sees them: their own fleet with the other
// side's shots on it, and the enemy sector with their own shots and the craft
// they have destroyed. On a desktop both sit side by side, each in a panel
// that says how much of that fleet is still intact. On a phone one board
// shows at a time under a battle strip — YOUR FLEET vs ENEMY SECTOR, with the
// same counts — and the shown board follows the turn: the enemy sector when
// it is the player's shot, their own fleet while the other side fires. A tap
// on the strip overrides that until the turn changes again.
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
  const phone = useMediaQuery(PHONE_ARENA);
  const other = otherPlayer(viewer);
  const columns = t("starbattle.columns");
  const total = StarBattle.FLEETS[state.fleet].length;
  const mine = state.vessels[viewer] ?? [];
  const theirs = revealEnemy ? state.vessels[other] ?? [] : StarBattle.destroyedVessels(state, other);
  const last = state.lastShot;
  const open = (x: number, y: number) => state.shots[viewer][y * state.size + x] === StarBattle.UNKNOWN;
  const myIntact = total - state.destroyed[other];
  const theirIntact = total - state.destroyed[viewer];

  // Whose turn it is, as a key: an override on the strip lasts one turn.
  const turnKey = state.status.kind === "playing" ? `turn-${state.status.turn}` : "over";
  const auto: Side = state.status.kind === "playing" && state.status.turn !== viewer ? "own" : "enemy";
  const [override, setOverride] = useState<{ side: Side; turnKey: string } | null>(null);
  const shown: Side = override && override.turnKey === turnKey ? override.side : auto;

  const enemyBoard = (
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
  );
  const ownBoard = (
    <SectorBoard
      size={state.size}
      shots={state.shots[other]}
      vessels={mine}
      kind="own"
      lastShot={last && last.by === other ? last : null}
      columns={columns}
      label={t("starbattle.sector.ownAria")}
    />
  );

  if (phone) {
    return (
      <div className="arena-boards is-phone">
        <div className="arena-strip" role="tablist" aria-label={t("starbattle.arena.whichSector")}>
          <Button
            variant="bare"
            role="tab"
            aria-selected={shown === "own"}
            className={`arena-strip-half is-you${shown === "own" ? " is-on" : ""}`}
            onClick={() => setOverride({ side: "own", turnKey })}
          >
            <span className="arena-strip-name">{t("starbattle.arena.stripYou")}</span>
            <span className="arena-strip-count">{myIntact} / {total}</span>
            <Pips lit={myIntact} total={total} />
          </Button>
          <span className="arena-strip-vs" aria-hidden="true">{t("starbattle.arena.vs")}</span>
          <Button
            variant="bare"
            role="tab"
            aria-selected={shown === "enemy"}
            className={`arena-strip-half is-them${shown === "enemy" ? " is-on" : ""}`}
            onClick={() => setOverride({ side: "enemy", turnKey })}
          >
            <span className="arena-strip-name">{t("starbattle.arena.stripThem")}</span>
            <span className="arena-strip-count">{theirIntact} / {total}</span>
            <Pips lit={theirIntact} total={total} />
          </Button>
        </div>
        <section className={`arena-panel is-${shown === "enemy" ? "enemy" : "own"}`} aria-label={shown === "enemy" ? t("starbattle.sector.enemyAria") : t("starbattle.sector.ownAria")}>
          {shown === "enemy" ? enemyBoard : ownBoard}
        </section>
      </div>
    );
  }

  return (
    <div className="arena-boards">
      <section className="arena-panel is-enemy" aria-label={t("starbattle.sector.enemyAria")}>
        <header className="arena-panel-head">
          <h2>{t("starbattle.sector.theirs", { name: names[other] })}</h2>
          <span className="arena-intact is-them">
            <span>{t("starbattle.arena.intact", { count: theirIntact, total })}</span>
            <Pips lit={theirIntact} total={total} />
          </span>
        </header>
        {enemyBoard}
      </section>
      <section className="arena-panel is-own" aria-label={t("starbattle.sector.ownAria")}>
        <header className="arena-panel-head">
          <h2>{t("starbattle.sector.yours", { name: names[viewer] })}</h2>
          <span className="arena-intact is-you">
            <span>{t("starbattle.arena.intact", { count: myIntact, total })}</span>
            <Pips lit={myIntact} total={total} />
          </span>
        </header>
        {ownBoard}
      </section>
    </div>
  );
}

function Pips({ lit, total }: { lit: number; total: number }) {
  return (
    <span className="arena-pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`arena-pip${i < lit ? " is-lit" : ""}`} />)}
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
