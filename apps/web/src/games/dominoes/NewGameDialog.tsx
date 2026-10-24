import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AiLevel, DominoesTarget } from "@isputnik/games-engine";
import { Choice } from "../../shared/Choice";
import { Dialog } from "../../shared/Dialog";
import { loadDominoesSetup, type DominoesSetup } from "./storage";

// The settings of a new game, in a dialog: how far it goes and the computer's
// level. They start from the last game's and are saved with it.
export function NewGameDialog({ onStart, onClose }: { onStart: (setup: DominoesSetup) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<DominoesSetup>(() => loadDominoesSetup());
  const patch = (changes: Partial<DominoesSetup>) => setSetup((s) => ({ ...s, ...changes }));

  return (
    <Dialog
      title={t("dominoes.setup.title")}
      confirmLabel={t("dominoes.setup.start")}
      cancelLabel={t("dominoes.setup.cancel")}
      onConfirm={() => onStart(setup)}
      onClose={onClose}
    >
      <div className="dom-setup">
        <Choice<DominoesTarget>
          label={t("dominoes.setup.target")}
          value={setup.target}
          options={[
            { value: 101, label: t("dominoes.setup.target101") },
            { value: 51, label: t("dominoes.setup.target51") }
          ]}
          onChange={(target) => patch({ target })}
        />
        <Choice<AiLevel>
          label={t("dominoes.setup.level")}
          value={setup.level}
          options={[
            { value: "easy", label: t("dominoes.setup.levelEasy") },
            { value: "normal", label: t("dominoes.setup.levelNormal") },
            { value: "hard", label: t("dominoes.setup.levelHard") }
          ]}
          onChange={(level) => patch({ level })}
        />
        <p className="muted dom-setup-note">{t("dominoes.setup.note")}</p>
      </div>
    </Dialog>
  );
}
