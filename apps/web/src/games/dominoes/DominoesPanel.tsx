import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { otherPlayer, type HandResult, type PlayerIndex } from "@isputnik/games-engine";
import { Dialog } from "../../shared/Dialog";
import { DominoTile } from "./DominoTile";

// The pieces of the panel and the dialogs around the table: the two totals as
// bars towards the target (the «козёл» meter), the summary that opens between
// hands, and the list of every hand so far.

const SEAT_CLASS = ["is-you", "is-them"] as const;

/** Seats in the order the panel lists them: the person first. */
const order = (me: PlayerIndex): PlayerIndex[] => [me, otherPlayer(me)];

export function DominoesScore({
  totals,
  target,
  hand,
  me,
  names
}: {
  totals: [number, number];
  target: number;
  hand: number;
  me: PlayerIndex;
  names: [string, string];
}) {
  const { t } = useTranslation();
  return (
    <section className="dom-score" aria-label={t("dominoes.score.aria")}>
      <div className="dom-score-head">
        <span className="dom-score-hand">{t("dominoes.score.hand", { count: hand })}</span>
        <span className="dom-score-target">{t("dominoes.score.target", { target })}</span>
      </div>
      {order(me).map((seat, i) => (
        <div key={seat} className={`dom-meter ${SEAT_CLASS[i]}`}>
          <div className="dom-meter-row">
            <span className="dom-meter-name"><span className="dom-meter-dot" aria-hidden="true" />{names[seat]}</span>
            <strong className="dom-meter-total">{totals[seat]}</strong>
          </div>
          <div className="dom-meter-track" aria-hidden="true">
            <span className="dom-meter-fill" style={{ width: `${Math.min(100, (totals[seat] / target) * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

/** What a finished hand was, in a sentence: who went out or why it stopped,
 *  and who collected what. */
function handLead(t: TFunction, result: HandResult, me: PlayerIndex, names: [string, string]): string {
  if (result.winner === null) return t("dominoes.summary.tieLead", { count: result.pips[0] });
  // Going out, the other hand pays; a «рыба», the heavier hand pays its own.
  // Either way it is the seat that did not win the hand.
  const collector = otherPlayer(result.winner);
  const points = result.points[collector];
  return collector === me
    ? t(result.fish ? "dominoes.summary.fishYou" : "dominoes.summary.collectYou", { count: points })
    : t(result.fish ? "dominoes.summary.fishThem" : "dominoes.summary.collectThem", { name: names[collector], count: points });
}

function handTitle(t: TFunction, result: HandResult, me: PlayerIndex, names: [string, string]): string {
  if (result.fish) return result.winner === null ? t("dominoes.summary.tieTitle") : t("dominoes.summary.fishTitle");
  return result.winner === me ? t("dominoes.summary.outYou") : t("dominoes.summary.outThem", { name: names[result.winner ?? 0] });
}

export function HandSummaryDialog({
  result,
  target,
  me,
  names,
  over,
  primary,
  secondary,
  onClose
}: {
  result: HandResult;
  target: number;
  me: PlayerIndex;
  names: [string, string];
  /** The game ended with this hand: who won it. */
  over: { winner: PlayerIndex | null } | null;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const before: [number, number] = [result.totals[0] - result.points[0], result.totals[1] - result.points[1]];
  const loser = over && over.winner !== null ? otherPlayer(over.winner) : null;
  const title = loser === null
    ? handTitle(t, result, me, names)
    : loser === me ? t("dominoes.summary.goatYou") : t("dominoes.summary.goatThem", { name: names[loser] });
  const eyebrow = over
    ? t("common.gameOver")
    : result.fish ? t("dominoes.summary.eyebrowFish", { count: result.hand }) : t("dominoes.score.hand", { count: result.hand });
  return (
    <Dialog
      title={title}
      confirmLabel={primary.label}
      cancelLabel={secondary?.label}
      onConfirm={primary.onClick}
      onCancel={secondary?.onClick}
      onClose={onClose}
    >
      <div className="dom-summary">
        <p className="dom-summary-eyebrow">{eyebrow}</p>
        <p className="dom-summary-lead">{over ? handTitle(t, result, me, names) + " · " : ""}{handLead(t, result, me, names)}</p>
        {order(me).map((seat, i) => (
          <div key={seat} className={`dom-summary-row ${SEAT_CLASS[i]}`}>
            <span className="dom-meter-name"><span className="dom-meter-dot" aria-hidden="true" />{names[seat]}</span>
            <span className="dom-summary-tiles">
              {result.hands[seat].length === 0
                ? <span className="muted">{t("dominoes.summary.wentOut")}</span>
                : result.hands[seat].map((tile) => (
                  <span key={tile.join(":")} className="dom-summary-tile" role="img" aria-label={tile.join(":")}>
                    <DominoTile a={tile[0]} b={tile[1]} vertical={false} />
                  </span>
                ))}
            </span>
            <span className="dom-summary-pips">{t("dominoes.summary.pips", { count: result.pips[seat] })}</span>
          </div>
        ))}
        <div className="dom-summary-totals">
          {order(me).map((seat, i) => (
            <div key={seat} className={`dom-meter ${SEAT_CLASS[i]}`}>
              <div className="dom-meter-row">
                <span>{names[seat]}</span>
                <span className="dom-meter-change">
                  {result.points[seat] > 0 && <span className="muted">{before[seat]} → </span>}
                  <strong>{result.totals[seat]}</strong> <span className="muted">{t("dominoes.summary.of", { target })}</span>
                </span>
              </div>
              <div className="dom-meter-track" aria-hidden="true">
                <span className="dom-meter-fill" style={{ width: `${Math.min(100, (before[seat] / target) * 100)}%` }} />
                <span className="dom-meter-fill is-added" style={{ width: `${Math.max(0, Math.min(100, (result.totals[seat] / target) * 100) - Math.min(100, (before[seat] / target) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export function HandHistoryDialog({
  history,
  me,
  names,
  onClose
}: {
  history: HandResult[];
  me: PlayerIndex;
  names: [string, string];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog title={t("dominoes.history.title")} confirmLabel={t("dominoes.history.close")} onConfirm={onClose} onClose={onClose}>
      {history.length === 0 ? (
        <p className="muted">{t("dominoes.history.empty")}</p>
      ) : (
        <ol className="dom-history">
          {history.map((result) => (
            <li key={result.hand}>
              <span className="dom-history-hand">{t("dominoes.score.hand", { count: result.hand })}</span>
              <span>{handTitle(t, result, me, names)} · {handLead(t, result, me, names)}</span>
              <span className="dom-history-totals">{result.totals[me]} : {result.totals[otherPlayer(me)]}</span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
