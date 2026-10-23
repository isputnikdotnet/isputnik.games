import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiLevel, FleetKind, PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { loadStarBattleSetup, type StarBattleMode, type StarBattleSetup } from "./storage";

function Choice<T extends string | number | null>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setup-row" role="group" aria-label={label}>
      <span className="setup-label">{label}</span>
      <div className="chip-row">
        {options.map((option) => (
          <Button key={String(option.value)} variant="chip" selected={option.value === value} onClick={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function NewGameForm({ onStart }: { onStart: (setup: StarBattleSetup) => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<StarBattleSetup>(() => loadStarBattleSetup());
  const patch = (changes: Partial<StarBattleSetup>) => setSetup((s) => ({ ...s, ...changes }));

  return (
    <section className="setup-card">
      <h2>{t("starbattle.setup.title")}</h2>
      <Choice<FleetKind>
        label={t("starbattle.setup.fleet")}
        value={setup.fleet}
        options={[
          { value: "classic", label: t("starbattle.setup.fleetClassic") },
          { value: "small", label: t("starbattle.setup.fleetSmall") }
        ]}
        onChange={(fleet) => patch({ fleet })}
      />
      <Choice<StarBattleMode>
        label={t("starbattle.setup.mode")}
        value={setup.mode}
        options={[
          { value: "computer", label: t("starbattle.setup.modeComputer") },
          { value: "local", label: t("starbattle.setup.modeLocal") }
        ]}
        onChange={(mode) => patch({ mode })}
      />
      {setup.mode === "computer" && (
        <>
          <Choice<PlayerIndex>
            label={t("starbattle.setup.firesFirst")}
            value={setup.computerPlays === 1 ? 0 : 1}
            options={[
              { value: 0, label: t("starbattle.players.you") },
              { value: 1, label: t("starbattle.players.computer") }
            ]}
            onChange={(first) => patch({ computerPlays: first === 0 ? 1 : 0 })}
          />
          <Choice<AiLevel>
            label={t("starbattle.setup.level")}
            value={setup.level}
            options={[
              { value: "easy", label: t("starbattle.setup.levelEasy") },
              { value: "normal", label: t("starbattle.setup.levelNormal") },
              { value: "hard", label: t("starbattle.setup.levelHard") }
            ]}
            onChange={(level) => patch({ level })}
          />
        </>
      )}
      <div className="setup-actions">
        <Button variant="primary" onClick={() => onStart(setup)}>{t("starbattle.setup.start")}</Button>
      </div>
    </section>
  );
}
