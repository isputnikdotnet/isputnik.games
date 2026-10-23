import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Crosshair } from "lucide-react";
import { follow, href } from "../../router";

// The frame of a Star Battle page before the battle (the menu, laying the
// fleet, an invitation): the title with the way back, the state chip on the
// right, and at the bottom the status bar — what to do now and the actions.
// The battle itself is on the game stage, with ArenaState at its panel's head.
export function ArenaHead({ chip }: { chip: string }) {
  const { t } = useTranslation();
  return (
    <header className="arena-head">
      <div className="arena-title">
        <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
        </a>
        <h1>{t("games.starbattle.name")}</h1>
        <p className="muted">{t("games.starbattle.summary")}</p>
      </div>
      <div className="arena-chip">
        <Crosshair size={22} aria-hidden="true" />
        <strong>{chip}</strong>
      </div>
    </header>
  );
}

export function ArenaStatus({ line, detail, children }: { line: string; detail?: string | null; children?: ReactNode }) {
  return (
    <section className="arena-status">
      <Crosshair size={30} aria-hidden="true" className="arena-status-icon" />
      <div className="arena-status-text">
        <strong role="status">{line}</strong>
        {detail && <span className="muted">{detail}</span>}
      </div>
      {children && <div className="arena-actions">{children}</div>}
    </section>
  );
}

/** Turns so far in the battle: a new one begins with every miss. */
export function turnNumber(feed: readonly { kind: string; result?: unknown }[]): number {
  return 1 + feed.filter((event) => event.kind === "fire" && event.result === "miss").length;
}

/** The battle's status at the head of the game stage's panel: what to do now
 *  with the turn count beside it, and under it the last thing that happened
 *  (or, after the end, why it ended). */
export function ArenaState({ line, turn, detail }: { line: string; turn?: number | null; detail?: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="arena-state">
      <p className="arena-state-line">
        <Crosshair size={18} aria-hidden="true" />
        <strong role="status">{line}</strong>
        {turn != null && <span className="arena-state-turn">{t("starbattle.arena.turn", { count: turn })}</span>}
      </p>
      {detail && <p className="arena-state-detail">{detail}</p>}
    </div>
  );
}
