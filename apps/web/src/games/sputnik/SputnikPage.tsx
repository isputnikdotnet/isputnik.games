import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArcadeCue, SputnikRail, SputnikVariant } from "@isputnik/games-engine";
import { GameStage } from "../../shared/GameStage";
import { play } from "../../shared/sound";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { Handheld, type HandheldControl } from "./Handheld";
import type { HandheldMode } from "./lit";
import { soundsOf } from "./sounds";
import { useArcadeReport } from "./useArcadeReport";
import { useArcadeRun } from "./useArcadeRun";

const sound = (cues: ArcadeCue[], mode: HandheldMode) => play(...soundsOf(cues, mode));

const RAIL_CODES: Record<string, SputnikRail> = { KeyQ: 0, KeyA: 1, KeyP: 2, KeyL: 3 };
const FLASH_MS = 110;

// Sputnik Catch, the first one-player game: a handheld in the spirit of the
// Электроника LCD games (docs/plan.md → Sputnik Catch). The handheld is the
// board; the panel beside it keeps the device's best scores, what the
// handheld is doing, and how to play. Keys go by position (event.code), so
// Q/A/P/L work on a Russian layout too.
export function SputnikPage() {
  const { t } = useTranslation();
  const run = useArcadeRun(sound);
  const report = useArcadeReport("sputnik", run.finished);
  const phone = useMediaQuery(PHONE);
  const [flash, setFlash] = useState<HandheldControl | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { move, togglePause, net } = run;
  const startRun = run.start;
  const start = useCallback((variant: SputnikVariant) => {
    play("lcdStart");
    startRun(variant);
  }, [startRun]);

  const press = useCallback((control: HandheldControl) => {
    setFlash(control);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      let rail = RAIL_CODES[event.code];
      if (event.code === "ArrowLeft") rail = (net % 2) as SputnikRail;
      if (event.code === "ArrowRight") rail = (2 + (net % 2)) as SputnikRail;
      if (event.code === "ArrowUp") rail = net < 2 ? 0 : 2;
      if (event.code === "ArrowDown") rail = net < 2 ? 1 : 3;
      if (rail !== undefined) {
        event.preventDefault();
        press(`rail${rail}`);
        move(rail);
      } else if (event.code === "Digit1") {
        press("gameA");
        start("A");
      } else if (event.code === "Digit2") {
        press("gameB");
        start("B");
      } else if (event.code === "Space" && target?.tagName !== "BUTTON") {
        event.preventDefault();
        press("pause");
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, net, press, start, togglePause]);

  const best = (
    <dl className="sputnik-best">
      <div>
        <dt>{t("sputnik.best.gameA")}</dt>
        <dd>{run.best.A}</dd>
      </div>
      <div>
        <dt>{t("sputnik.best.gameB")}</dt>
        <dd>{run.best.B}</dd>
      </div>
    </dl>
  );

  const variant = run.state.variant;
  let status: string;
  if (run.mode === "play") status = t("sputnik.status.playing", { game: variant === "A" ? t("sputnik.gameA") : t("sputnik.gameB") });
  else if (run.mode === "paused") status = t("sputnik.status.paused");
  else if (run.mode === "over" && run.finished?.best) status = t("sputnik.status.overBest", { count: run.finished.caught });
  else if (run.mode === "over") status = t("sputnik.status.over", { count: run.state.caught });
  else status = t("sputnik.status.demo");

  let saved: string | null = null;
  if (run.mode === "over" && run.finished && report?.status === "saving") saved = t("sputnik.saved.saving");
  if (run.mode === "over" && run.finished && report?.status === "saved") {
    saved = t("sputnik.saved.saved", { best: report.answer.best, game: run.finished.variant === "A" ? t("sputnik.gameA") : t("sputnik.gameB") });
  }
  if (run.mode === "over" && run.finished && report?.status === "failed") saved = t("sputnik.saved.failed");

  return (
    <GameStage
      className="is-sputnik"
      title={t("games.sputnik.name")}
      board={
        <Handheld
          view={{ mode: run.mode, state: run.state, net: run.net, blink: run.blink }}
          flash={flash}
          onMove={move}
          onStart={start}
          onPause={togglePause}
        />
      }
      // On a phone the stage puts the score above the board; the best scores
      // go under it there, so the handheld's buttons stay on the screen.
      score={phone ? undefined : best}
      notices={
        <>
          <p className="sputnik-status" aria-live="polite">{status}</p>
          {saved && <p className="sputnik-saved muted">{saved}</p>}
          {phone && best}
        </>
      }
      log={
        <div className="sputnik-help">
          <h2>{t("sputnik.help.rulesTitle")}</h2>
          <ul>
            <li>{t("sputnik.help.rules.catch")}</li>
            <li>{t("sputnik.help.rules.crash")}</li>
            <li>{t("sputnik.help.rules.belka")}</li>
            <li>{t("sputnik.help.rules.pardon")}</li>
            <li>{t("sputnik.help.rules.gameB")}</li>
          </ul>
          <h2>{t("sputnik.help.controlsTitle")}</h2>
          <ul>
            <li>{t("sputnik.help.controls.rails")}</li>
            <li>{t("sputnik.help.controls.arrows")}</li>
            <li>{t("sputnik.help.controls.games")}</li>
            <li>{t("sputnik.help.controls.touch")}</li>
          </ul>
        </div>
      }
    />
  );
}
