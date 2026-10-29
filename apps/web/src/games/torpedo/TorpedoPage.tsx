import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Minimize, Pause, Play, Star } from "lucide-react";
import { Torpedo, type ArcadeCue, type ShipKind, type TorpedoState } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { GameStage } from "../../shared/GameStage";
import { play } from "../../shared/sound";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { follow, href } from "../../router";
import { useArcadeReport, type ReportState } from "../sputnik/useArcadeReport";
import { useFullscreen } from "../sputnik/useFullscreen";
import { Periscope, type Banner } from "./Periscope";
import { soundsOf } from "./sounds";
import { useTorpedoRun, type TorpedoMode } from "./useTorpedoRun";
import { formatScore } from "./view";

const { SHIPS, SHIP_KINDS, BONUS_AT } = Torpedo;

/** The breakdown's order: the ship worth most first. */
const BY_POINTS: readonly ShipKind[] = [...SHIP_KINDS].sort((a, b) => SHIPS[b].points - SHIPS[a].points);

// Torpedo Run, a periscope game for one player in the spirit of the old
// electromechanical arcade cabinets (docs/plan.md → Torpedo Run). The
// periscope is the board; the panel beside it keeps the score, the device's
// best, the ships and what they are worth, and how a round goes — all in view,
// so there is no rules dialog to pause for. Keys go by position (event.code).
export function TorpedoPage() {
  const { t } = useTranslation();
  const [banner, setBanner] = useState<Banner | null>(null);
  const onCues = useCallback((cues: ArcadeCue[], mode: TorpedoMode, state: TorpedoState) => {
    play(...soundsOf(cues, mode));
    if (mode !== "play") return;
    const hit = cues.find((cue) => cue.kind === "hit");
    if (cues.some((cue) => cue.kind === "bonus")) setBanner({ kind: "bonus", tick: state.tick });
    else if (hit) setBanner({ kind: "hit", points: hit.points as number, tick: state.tick });
    else if (cues.some((cue) => cue.kind === "miss")) setBanner({ kind: "miss", tick: state.tick });
  }, []);
  const run = useTorpedoRun(onCues);
  const report = useArcadeReport("torpedo", run.finished);
  const phone = useMediaQuery(PHONE);
  const fullscreen = useFullscreen();
  const { fire, hold, aim, togglePause, mode, state } = run;

  useEffect(() => {
    const turnKey = (code: string) => (code === "ArrowLeft" || code === "KeyA" ? "left" : code === "ArrowRight" || code === "KeyD" ? "right" : null);
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const side = turnKey(event.code);
      if (side) {
        event.preventDefault();
        hold(side, true);
      } else if ((event.code === "Space" || event.code === "Enter") && !target?.closest("button, a")) {
        // A focused button or link takes Space and Enter as its own press.
        event.preventDefault();
        if (!event.repeat) fire();
      } else if (event.code === "KeyP" || event.code === "Escape") {
        togglePause();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const side = turnKey(event.code);
      if (side) hold(side, false);
    };
    // Keys let go while the window was elsewhere would stay held.
    const onBlur = () => {
      hold("left", false);
      hold("right", false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [fire, hold, togglePause]);

  // The fire button starts a run too; it sounds the periscope's ping.
  const onFire = useCallback(() => {
    if (mode === "demo" || mode === "over") play("torpedoStart");
    fire();
  }, [fire, mode]);

  let status: string;
  if (mode === "play") status = state.round > 1 ? t("torpedo.status.bonusRound") : t("torpedo.status.playing");
  else if (mode === "paused") status = t("torpedo.status.paused");
  else if (mode === "bonus") status = t("torpedo.status.bonus");
  else if (mode === "over" && run.finished?.best) status = t("torpedo.status.overBest", { score: formatScore(state.score) });
  else if (mode === "over") status = t("torpedo.status.over", { score: formatScore(state.score) });
  else status = t("torpedo.status.demo");

  const best = (
    <dl className="torpedo-best">
      <div>
        <dt>{t("torpedo.best.score")}</dt>
        <dd>{mode === "demo" ? "—" : formatScore(state.score)}</dd>
      </div>
      <div>
        <dt>{t("torpedo.best.device")}</dt>
        <dd>{formatScore(run.best)}</dd>
      </div>
    </dl>
  );

  const contacts = (
    <section className="torpedo-panel-section" aria-labelledby="torpedo-contacts-title">
      <h2 id="torpedo-contacts-title">{t("torpedo.contacts.title")}</h2>
      <ul className="torpedo-contacts">
        {SHIP_KINDS.map((kind) => (
          <li key={kind}>
            <span>
              <strong>{t(`torpedo.ships.${kind}`)}</strong>
              <span className="muted">{t(`torpedo.contacts.${kind}`)}</span>
            </span>
            <span className="torpedo-contacts-points">{SHIPS[kind].points}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  const rules = (
    <section className="torpedo-panel-section" aria-labelledby="torpedo-rules-title">
      <h2 id="torpedo-rules-title">{t("torpedo.rules.title")}</h2>
      <ol className="torpedo-rules">
        <li>{t("torpedo.rules.torpedoes")}</li>
        <li>{t("torpedo.rules.lead")}</li>
        <li>{t("torpedo.rules.points")}</li>
        <li>{t("torpedo.rules.bonus", { score: formatScore(BONUS_AT) })}</li>
        <li>{t("torpedo.rules.clock")}</li>
      </ol>
      <p className="torpedo-keys muted">{phone ? t("torpedo.keys.touch") : t("torpedo.keys.desktop")}</p>
    </section>
  );

  // On a phone the two ride on the lens as icons, so the scope keeps the screen.
  const tools = phone ? (
    <>
      <button
        type="button"
        className="torpedo-tool"
        onClick={togglePause}
        disabled={mode !== "play" && mode !== "paused"}
        aria-label={mode === "paused" ? t("torpedo.controls.resume") : t("torpedo.controls.pause")}
        title={mode === "paused" ? t("torpedo.controls.resume") : t("torpedo.controls.pause")}
      >
        {mode === "paused" ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
      </button>
      {fullscreen.supported && (
        <button
          type="button"
          className="torpedo-tool"
          onClick={() => void fullscreen.toggle()}
          aria-label={fullscreen.on ? t("torpedo.fullscreen.exit") : t("torpedo.fullscreen.enter")}
          title={fullscreen.on ? t("torpedo.fullscreen.exit") : t("torpedo.fullscreen.enter")}
        >
          {fullscreen.on ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
        </button>
      )}
    </>
  ) : undefined;

  const card = mode === "bonus" || mode === "over" ? <RoundCard mode={mode} state={state} report={report} best={run.finished?.best ?? false} onFire={onFire} /> : null;

  return (
    <GameStage
      className="is-torpedo"
      title={t("games.torpedo.name")}
      board={<Periscope mode={mode} state={state} banner={banner} overlay={card} tools={tools} onFire={onFire} onHold={hold} onAim={aim} />}
      score={phone ? undefined : best}
      notices={
        <>
          <p className="torpedo-status" aria-live="polite">{status}</p>
          {phone && best}
        </>
      }
      log={
        <>
          {contacts}
          {rules}
        </>
      }
      actions={
        phone ? undefined : (
          <>
            <Button variant="secondary" onClick={togglePause} disabled={mode !== "play" && mode !== "paused"}>
              {mode === "paused" ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              {" "}{mode === "paused" ? t("torpedo.controls.resume") : t("torpedo.controls.pause")}
            </Button>
            {fullscreen.supported && (
              <Button variant="secondary" onClick={() => void fullscreen.toggle()}>
                {fullscreen.on ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
                {" "}{fullscreen.on ? t("torpedo.fullscreen.exit") : t("torpedo.fullscreen.enter")}
              </Button>
            )}
          </>
        )
      }
    />
  );
}

/** The card laid over the lens when a round is over: the score, the round's
 *  hits ship by ship, the bonus when earned, and what comes next. */
function RoundCard({ mode, state, report, best, onFire }: { mode: "bonus" | "over"; state: TorpedoState; report: ReportState | null; best: boolean; onFire: () => void }) {
  const { t } = useTranslation();
  const round = state.rounds[state.rounds.length - 1];
  const hits = SHIP_KINDS.reduce((sum, kind) => sum + round.hits[kind], 0);
  const back = href();
  let title = t("torpedo.card.roundOver");
  if (mode === "over" && state.round > 1) title = t("torpedo.card.bonusOver");
  let saved: string | null = null;
  if (mode === "over" && report?.status === "saving") saved = t("torpedo.saved.saving");
  if (mode === "over" && report?.status === "saved") saved = t("torpedo.saved.saved", { best: formatScore(report.answer.best) });
  if (mode === "over" && report?.status === "failed") saved = t("torpedo.saved.failed");

  return (
    <section className="torpedo-card" aria-labelledby="torpedo-card-title" aria-live="polite">
      <h2 id="torpedo-card-title" className="torpedo-card-label">{title}</h2>
      <p className="torpedo-card-score">{formatScore(state.score)}</p>
      <p className="torpedo-card-hits">{t("torpedo.card.hits", { count: hits, fired: round.fired })}</p>
      {mode === "bonus" && (
        <div className="torpedo-card-bonus">
          <Star size={28} aria-hidden="true" />
          <div>
            <strong>{t("torpedo.card.bonusTitle")}</strong>
            <span>{t("torpedo.card.bonusBody", { score: formatScore(BONUS_AT) })}</span>
          </div>
        </div>
      )}
      <dl className="torpedo-card-rows">
        {BY_POINTS.filter((kind) => round.hits[kind] > 0).map((kind) => (
          <div key={kind}>
            <dt>{t("torpedo.card.row", { ship: t(`torpedo.ships.${kind}`), count: round.hits[kind] })}</dt>
            <dd>{formatScore(round.hits[kind] * SHIPS[kind].points)}</dd>
          </div>
        ))}
        {hits === 0 && <div><dt>{t("torpedo.card.noHits")}</dt><dd>0</dd></div>}
        {state.rounds.length > 1 && (
          <div className="is-total">
            <dt>{t("torpedo.card.rounds", { first: formatScore(state.rounds[0].score), bonus: formatScore(state.rounds[1].score) })}</dt>
            <dd>{formatScore(state.score)}</dd>
          </div>
        )}
      </dl>
      {mode === "over" && best && <p className="torpedo-card-note">{t("torpedo.card.newBest")}</p>}
      {saved && <p className="torpedo-card-note">{saved}</p>}
      <div className="torpedo-card-actions">
        <button type="button" className="torpedo-card-fire" onClick={onFire} autoFocus>
          {mode === "bonus" ? t("torpedo.card.playBonus") : t("torpedo.card.again")}
        </button>
        <a className="torpedo-card-back" href={back} onClick={(event) => follow(event, back)}>{t("app.allGames")}</a>
      </div>
    </section>
  );
}
