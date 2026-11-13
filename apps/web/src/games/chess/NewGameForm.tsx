import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Chess, TIME_CONTROLS, timeControlKey, type AiLevel, type PlayerIndex } from "@isputnik/games-engine";
import { fetchAdaptiveStrength, type AdaptiveStrength } from "../../api";
import { clockLabel } from "./clockText";
import { Button } from "../../shared/Button";
import { Choice } from "../../shared/Choice";
import { href, navigate } from "../../router";
import {
  loadChessSetup,
  loadPlaysPuzzles,
  loadPuzzleChoice,
  savePlaysPuzzles,
  savePuzzleChoice,
  type ChessMode,
  type ChessSetup,
  type LevelMode,
  type PuzzleChoice
} from "./storage";

// The way into chess: a game against the computer, two at one screen, or
// puzzles — of a kind and a level the player picks. Online games start from
// the lobby's Invite instead.
export function ChessNewGameForm({ onStart }: { onStart: (setup: ChessSetup) => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<ChessSetup>(() => loadChessSetup());
  const [puzzles, setPuzzles] = useState<PuzzleChoice>(() => loadPuzzleChoice());
  const [what, setWhat] = useState<ChessMode | "puzzles">(() => (loadPlaysPuzzles() ? "puzzles" : setup.mode));
  const patch = (changes: Partial<ChessSetup>) => setSetup((s) => ({ ...s, ...changes }));

  // The adaptive computer asks the server where the player stands, each time it is chosen.
  const [adaptive, setAdaptive] = useState<AdaptiveStrength | null>(null);
  const [adaptiveFailed, setAdaptiveFailed] = useState(false);
  const wantsAdaptive = what === "computer" && setup.levelMode === "adaptive";
  useEffect(() => {
    if (!wantsAdaptive) return;
    let live = true;
    fetchAdaptiveStrength().then((answer) => live && setAdaptive(answer), () => live && setAdaptiveFailed(true));
    return () => {
      live = false;
    };
  }, [wantsAdaptive]);

  const start = () => {
    savePlaysPuzzles(what === "puzzles");
    if (what === "puzzles") {
      savePuzzleChoice(puzzles);
      navigate(href("chess/puzzles"));
      return;
    }
    let chosen: ChessSetup = { ...setup, mode: what };
    if (what === "computer" && setup.levelMode !== "level") {
      // Adaptive with no answer (offline): the strength it last played at, or the middle.
      const strength = setup.levelMode === "adaptive" ? adaptive?.strength ?? setup.strength ?? 50 : setup.strength ?? 50;
      chosen = { ...chosen, strength, level: Chess.levelOfStrength(strength) };
    }
    onStart(chosen);
  };

  const levelValue: AiLevel | LevelMode = setup.levelMode === "level" ? setup.level : setup.levelMode;
  const chooseLevel = (value: AiLevel | LevelMode) => {
    if (value === "custom") patch({ levelMode: "custom", strength: setup.strength ?? 50, level: Chess.levelOfStrength(setup.strength ?? 50) });
    else if (value === "adaptive") patch({ levelMode: "adaptive" });
    else patch({ levelMode: "level", level: value as AiLevel, strength: null });
  };

  return (
    <section className="setup-card">
      <h2>{what === "puzzles" ? t("chess.puzzle.title") : t("chess.setup.title")}</h2>
      <Choice<ChessMode | "puzzles">
        label={t("chess.setup.mode")}
        value={what}
        options={[
          { value: "computer", label: t("chess.setup.modeComputer") },
          { value: "local", label: t("chess.setup.modeLocal") },
          { value: "puzzles", label: t("chess.setup.modePuzzles") }
        ]}
        onChange={setWhat}
      />
      {what === "computer" && (
        <>
          {/* Asked as the colour you play; stored as the seat the computer takes. */}
          <Choice<PlayerIndex>
            label={t("chess.setup.youPlay")}
            value={setup.computerPlays === 0 ? 1 : 0}
            options={[
              { value: 0, label: t("chess.players.white") },
              { value: 1, label: t("chess.players.black") }
            ]}
            onChange={(you) => patch({ computerPlays: you === 0 ? 1 : 0 })}
          />
          <Choice<AiLevel | LevelMode>
            label={t("chess.setup.level")}
            value={levelValue}
            options={[
              { value: "easy", label: t("chess.setup.levelEasy") },
              { value: "normal", label: t("chess.setup.levelNormal") },
              { value: "hard", label: t("chess.setup.levelHard") },
              { value: "custom", label: t("chess.strength.custom") },
              { value: "adaptive", label: t("chess.strength.adaptive") }
            ]}
            onChange={chooseLevel}
          />
          {setup.levelMode === "custom" && (
            <StrengthSlider value={setup.strength ?? 50} onChange={(strength) => patch({ strength, level: Chess.levelOfStrength(strength) })} />
          )}
          {setup.levelMode === "adaptive" && (
            <p className="muted strength-note">
              {adaptive
                ? t(`chess.strength.from.${adaptive.source}`, { elo: adaptive.elo, target: adaptive.target })
                : adaptiveFailed
                  ? t("chess.strength.offline", { elo: Chess.strengthElo(setup.strength ?? 50) })
                  : t("app.loading")}
            </p>
          )}
        </>
      )}
      {what !== "puzzles" && <ClockChoice setup={setup} onChange={(clock) => patch({ clock })} />}
      {what === "puzzles" && (
        <>
          <Choice<PuzzleChoice["type"]>
            label={t("chess.puzzle.typeLabel")}
            value={puzzles.type}
            options={puzzleTypeOptions(t)}
            onChange={(type) => setPuzzles((p) => ({ ...p, type }))}
          />
          <Choice<PuzzleChoice["level"]>
            label={t("chess.setup.level")}
            value={puzzles.level}
            options={puzzleLevelOptions(t)}
            onChange={(level) => setPuzzles((p) => ({ ...p, level }))}
          />
        </>
      )}
      <div className="setup-actions">
        <Button variant="primary" onClick={start}>
          {what === "puzzles" ? t("chess.setup.startPuzzles") : t("chess.setup.start")}
        </Button>
      </div>
    </section>
  );
}

type Translate = TFunction;

/** The computer's strength on the 0-100 scale, with the rating it plays like. */
function StrengthSlider({ value, onChange }: { value: number; onChange: (strength: number) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="setup-row strength-row">
      <label className="setup-label" htmlFor={id}>{t("chess.strength.label")}</label>
      <div className="strength-slider">
        <span className="muted" aria-hidden="true">0</span>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-valuetext={t("chess.strength.valueText", { strength: value, elo: Chess.strengthElo(value) })}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="muted" aria-hidden="true">100</span>
        <output htmlFor={id} className="strength-value">{t("chess.strength.valueText", { strength: value, elo: Chess.strengthElo(value) })}</output>
      </div>
    </div>
  );
}

/** The clock: none, or one of the engine's time controls (blitz). */
export function ClockChoice({ setup, onChange }: { setup: Pick<ChessSetup, "clock">; onChange: (clock: ChessSetup["clock"]) => void }) {
  const { t } = useTranslation();
  return (
    <Choice<string>
      label={t("chess.clock.label")}
      value={setup.clock ? timeControlKey(setup.clock) : "off"}
      options={[
        { value: "off", label: t("chess.clock.off") },
        ...TIME_CONTROLS.map((control) => ({ value: timeControlKey(control), label: clockLabel(control, t) }))
      ]}
      onChange={(key) => onChange(TIME_CONTROLS.find((control) => timeControlKey(control) === key) ?? null)}
    />
  );
}

export function puzzleTypeOptions(t: Translate): { value: PuzzleChoice["type"]; label: string }[] {
  return (["any", ...Chess.PUZZLE_TYPES] as PuzzleChoice["type"][]).map((value) => ({ value, label: t(`chess.puzzle.types.${value}`) }));
}

export function puzzleLevelOptions(t: Translate): { value: PuzzleChoice["level"]; label: string }[] {
  return (["auto", ...Chess.PUZZLE_LEVELS] as PuzzleChoice["level"][]).map((value) => ({ value, label: t(`chess.puzzle.levels.${value}`) }));
}
