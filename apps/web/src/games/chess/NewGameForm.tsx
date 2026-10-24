import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Chess, type AiLevel, type PlayerIndex } from "@isputnik/games-engine";
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

  const start = () => {
    savePlaysPuzzles(what === "puzzles");
    if (what === "puzzles") {
      savePuzzleChoice(puzzles);
      navigate(href("chess/puzzles"));
    } else {
      onStart({ ...setup, mode: what });
    }
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
          <Choice<AiLevel>
            label={t("chess.setup.level")}
            value={setup.level}
            options={[
              { value: "easy", label: t("chess.setup.levelEasy") },
              { value: "normal", label: t("chess.setup.levelNormal") },
              { value: "hard", label: t("chess.setup.levelHard") }
            ]}
            onChange={(level) => patch({ level })}
          />
        </>
      )}
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

type Translate = ReturnType<typeof useTranslation>["t"];

export function puzzleTypeOptions(t: Translate): { value: PuzzleChoice["type"]; label: string }[] {
  return (["any", ...Chess.PUZZLE_TYPES] as PuzzleChoice["type"][]).map((value) => ({ value, label: t(`chess.puzzle.types.${value}`) }));
}

export function puzzleLevelOptions(t: Translate): { value: PuzzleChoice["level"]; label: string }[] {
  return (["auto", ...Chess.PUZZLE_LEVELS] as PuzzleChoice["level"][]).map((value) => ({ value, label: t(`chess.puzzle.levels.${value}`) }));
}
