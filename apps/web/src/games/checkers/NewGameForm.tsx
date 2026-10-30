import { useTranslation } from "react-i18next";
import type { AiLevel, PlayerIndex } from "@isputnik/games-engine";
import { Choice } from "../../shared/Choice";
import { Button } from "../../shared/Button";
import type { CheckersSetup } from "./storage";
export function CheckersNewGameForm({
  setup,
  onChange,
  onStart
}: {
  setup: CheckersSetup;
  onChange(setup: CheckersSetup): void;
  onStart(): void;
}) {
  const { t } = useTranslation();
  return (
    <section className="setup-card">
      <h2>{t("chess.setup.title")}</h2>
      <Choice<CheckersSetup["mode"]>
        label={t("chess.setup.mode")}
        value={setup.mode}
        options={[
          { value: "computer", label: t("chess.setup.modeComputer") },
          { value: "local", label: t("chess.setup.modeLocal") }
        ]}
        onChange={(mode) => onChange({ ...setup, mode })}
      />
      {setup.mode === "computer" && (
        <>
          <Choice<PlayerIndex>
            label={t("chess.setup.youPlay")}
            value={setup.computerPlays === 0 ? 1 : 0}
            options={[
              { value: 0, label: t("chess.players.white") },
              { value: 1, label: t("chess.players.black") }
            ]}
            onChange={(seat) => onChange({ ...setup, computerPlays: seat === 0 ? 1 : 0 })}
          />
          <Choice<AiLevel>
            label={t("chess.setup.level")}
            value={setup.level}
            options={[
              { value: "easy", label: t("chess.setup.levelEasy") },
              { value: "normal", label: t("chess.setup.levelNormal") },
              { value: "hard", label: t("chess.setup.levelHard") }
            ]}
            onChange={(level) => onChange({ ...setup, level })}
          />
        </>
      )}
      <div className="setup-actions">
        <Button variant="primary" onClick={onStart}>
          {t("chess.setup.start")}
        </Button>
      </div>
      <p className="muted">{t("checkers.rules")}</p>
    </section>
  );
}
