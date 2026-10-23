import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { follow, href } from "../router";
import { PHONE, useMediaQuery } from "./useMediaQuery";

// The one way a game in play takes the screen, after chess sites: the board
// as tall as the window allows on the left, and beside it one panel the full
// height of the board — the way back and the game's name at its head, then the
// score, anything the moment needs (an error, a guest link), the log taking
// what height is left, and the actions at its foot where the hand rests. No
// page heading above the board: every row there was a row the board lost.
//
// On a phone it stacks: the title and the score above the board, the actions
// under it within thumb's reach, the log last.
export function GameStage({
  title,
  board,
  score,
  notices,
  log,
  actions,
  className = ""
}: {
  title: string;
  board: ReactNode;
  score?: ReactNode;
  /** Whatever the moment needs between the score and the log. */
  notices?: ReactNode;
  log?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const phone = useMediaQuery(PHONE);
  const back = href();

  if (phone) {
    return (
      <section className={`game-stage is-phone ${className}`.trim()}>
        <h1 className="game-stage-title">{title}</h1>
        {score}
        <div className="game-stage-board">{board}</div>
        {actions && <div className="game-stage-actions">{actions}</div>}
        {notices}
        {log}
      </section>
    );
  }

  return (
    <section className={`game-stage ${className}`.trim()}>
      <div className="game-stage-board">{board}</div>
      <aside className="game-stage-panel">
        <header className="game-stage-head">
          <a className="text-link" href={back} onClick={(event) => follow(event, back)}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
          </a>
          <h1 className="game-stage-title">{title}</h1>
        </header>
        {score}
        {notices}
        <div className="game-stage-log">{log}</div>
        {actions && <div className="game-stage-actions">{actions}</div>}
      </aside>
    </section>
  );
}
