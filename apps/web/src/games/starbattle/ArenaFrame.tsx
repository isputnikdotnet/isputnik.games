import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Crosshair } from "lucide-react";
import { follow, href } from "../../router";

// The frame of a Star Battle page: the title with the way back, the turn chip
// on the right, and at the bottom the status bar — what to do now, the last
// thing that happened, and the actions. The boards, the editor or the menu go
// in between.
export function ArenaHead({ chip, turn }: { chip: string; turn?: number | null }) {
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
        {turn != null && (
          <>
            <span className="arena-chip-sep" aria-hidden="true" />
            <span>{t("starbattle.arena.turn", { count: turn })}</span>
          </>
        )}
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
