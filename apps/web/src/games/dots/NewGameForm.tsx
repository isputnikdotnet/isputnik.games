import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dots, type AiLevel, type PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { loadDotsSetup, type DotsMode, type DotsSetup } from "./storage";

const TARGETS: (number | null)[] = [null, 5, 10, 20];

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
          <Button
            key={String(option.value)}
            variant="chip"
            selected={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function NewGameForm({ onStart }: { onStart: (setup: DotsSetup) => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<DotsSetup>(() => loadDotsSetup());
  const patch = (changes: Partial<DotsSetup>) => setSetup((s) => ({ ...s, ...changes }));

  return (
    <section className="setup-card">
      <h2>{t("dots.setup.title")}</h2>
      <Choice<number>
        label={t("dots.setup.size")}
        value={setup.size}
        options={Dots.BOARD_SIZES.map((size) => ({ value: size, label: t("dots.setup.sizeValue", { size }) }))}
        onChange={(size) => patch({ size })}
      />
      <Choice<DotsMode>
        label={t("dots.setup.mode")}
        value={setup.mode}
        options={[
          { value: "computer", label: t("dots.setup.modeComputer") },
          { value: "local", label: t("dots.setup.modeLocal") }
        ]}
        onChange={(mode) => patch({ mode })}
      />
      {setup.mode === "computer" && (
        <>
          <Choice<PlayerIndex>
            label={t("dots.setup.computerPlays")}
            value={setup.computerPlays}
            options={[
              { value: 1, label: t("dots.players.red") },
              { value: 0, label: t("dots.players.blue") }
            ]}
            onChange={(computerPlays) => patch({ computerPlays })}
          />
          <Choice<AiLevel>
            label={t("dots.setup.level")}
            value={setup.level}
            options={[
              { value: "easy", label: t("dots.setup.levelEasy") },
              { value: "normal", label: t("dots.setup.levelNormal") },
              { value: "hard", label: t("dots.setup.levelHard") }
            ]}
            onChange={(level) => patch({ level })}
          />
        </>
      )}
      <Choice<number | null>
        label={t("dots.setup.target")}
        value={setup.targetCaptures}
        options={TARGETS.map((target) => ({
          value: target,
          label: target === null ? t("dots.setup.targetFull") : t("dots.setup.targetN", { count: target })
        }))}
        onChange={(targetCaptures) => patch({ targetCaptures })}
      />
      <div className="setup-actions">
        <Button variant="primary" onClick={() => onStart(setup)}>{t("dots.setup.start")}</Button>
      </div>
    </section>
  );
}
