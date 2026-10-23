import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiLevel, FleetKind, PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { loadSeaBattleSetup, type SeaBattleMode, type SeaBattleSetup } from "./storage";

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

export function NewGameForm({ onStart }: { onStart: (setup: SeaBattleSetup) => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<SeaBattleSetup>(() => loadSeaBattleSetup());
  const patch = (changes: Partial<SeaBattleSetup>) => setSetup((s) => ({ ...s, ...changes }));

  return (
    <section className="setup-card">
      <h2>{t("seabattle.setup.title")}</h2>
      <Choice<FleetKind>
        label={t("seabattle.setup.fleet")}
        value={setup.fleet}
        options={[
          { value: "classic", label: t("seabattle.setup.fleetClassic") },
          { value: "small", label: t("seabattle.setup.fleetSmall") }
        ]}
        onChange={(fleet) => patch({ fleet })}
      />
      <Choice<SeaBattleMode>
        label={t("seabattle.setup.mode")}
        value={setup.mode}
        options={[
          { value: "computer", label: t("seabattle.setup.modeComputer") },
          { value: "local", label: t("seabattle.setup.modeLocal") }
        ]}
        onChange={(mode) => patch({ mode })}
      />
      {setup.mode === "computer" && (
        <>
          <Choice<PlayerIndex>
            label={t("seabattle.setup.firesFirst")}
            value={setup.computerPlays === 1 ? 0 : 1}
            options={[
              { value: 0, label: t("seabattle.players.you") },
              { value: 1, label: t("seabattle.players.computer") }
            ]}
            onChange={(first) => patch({ computerPlays: first === 0 ? 1 : 0 })}
          />
          <Choice<AiLevel>
            label={t("seabattle.setup.level")}
            value={setup.level}
            options={[
              { value: "easy", label: t("seabattle.setup.levelEasy") },
              { value: "normal", label: t("seabattle.setup.levelNormal") },
              { value: "hard", label: t("seabattle.setup.levelHard") }
            ]}
            onChange={(level) => patch({ level })}
          />
        </>
      )}
      <div className="setup-actions">
        <Button variant="primary" onClick={() => onStart(setup)}>{t("seabattle.setup.start")}</Button>
      </div>
    </section>
  );
}
