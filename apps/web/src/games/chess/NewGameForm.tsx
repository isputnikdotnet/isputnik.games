import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiLevel, PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Choice } from "../../shared/Choice";
import { loadChessSetup, type ChessMode, type ChessSetup } from "./storage";

export function ChessNewGameForm({ onStart }: { onStart: (setup: ChessSetup) => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<ChessSetup>(() => loadChessSetup());
  const patch = (changes: Partial<ChessSetup>) => setSetup((s) => ({ ...s, ...changes }));

  return (
    <section className="setup-card">
      <h2>{t("chess.setup.title")}</h2>
      <Choice<ChessMode>
        label={t("chess.setup.mode")}
        value={setup.mode}
        options={[
          { value: "computer", label: t("chess.setup.modeComputer") },
          { value: "local", label: t("chess.setup.modeLocal") }
        ]}
        onChange={(mode) => patch({ mode })}
      />
      {setup.mode === "computer" && (
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
      <div className="setup-actions">
        <Button variant="primary" onClick={() => onStart(setup)}>{t("chess.setup.start")}</Button>
      </div>
    </section>
  );
}
