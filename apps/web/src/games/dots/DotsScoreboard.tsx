import { useTranslation } from "react-i18next";
import type { PlayerIndex } from "@isputnik/games-engine";

export type ScoreSide = { name: string; captures: number; active: boolean };

// The score — blue's captures : red's, the side to move lit — with the status
// line and, after the end, why it ended. On a desktop it opens the side panel;
// on a phone it stands above the board in a compact card of its own (is-top),
// so what matters is on the screen before the board pushes it off.
export function DotsScoreboard({ sides, statusLine, finished, reason, top = false }: {
  sides: [ScoreSide, ScoreSide];
  statusLine: string;
  finished: boolean;
  reason?: string | null;
  top?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={`dots-scoreboard${top ? " is-top" : ""}`}>
      <div className="dots-score" aria-label={t("dots.captures")}>
        <ScoreCell player={0} {...sides[0]} />
        <span className="dots-score-colon">:</span>
        <ScoreCell player={1} {...sides[1]} />
      </div>
      <p className={`dots-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
      {reason && <p className="muted dots-reason">{reason}</p>}
    </div>
  );
}

function ScoreCell({ player, name, captures, active }: ScoreSide & { player: PlayerIndex }) {
  return (
    <div className={`dots-score-cell is-p${player + 1}${active ? " is-active" : ""}`}>
      <span className="dots-score-dot" aria-hidden="true" />
      <span className="dots-score-name">{name}</span>
      <strong className="dots-score-count">{captures}</strong>
    </div>
  );
}
