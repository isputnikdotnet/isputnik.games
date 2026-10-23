import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";

// The end of a game, announced where it cannot be missed. The board stays
// behind it; closing it (Escape, the backdrop) leaves the result in the panel.
export function GameOverDialog({
  headline,
  scoreLine,
  reason,
  primary,
  secondary,
  onClose
}: {
  /** "Blue wins", "You win", "A draw". */
  headline: string;
  scoreLine: string;
  reason: string | null;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      title={t("common.gameOver")}
      confirmLabel={primary.label}
      cancelLabel={secondary?.label}
      onConfirm={primary.onClick}
      onCancel={secondary?.onClick}
      onClose={onClose}
    >
      <p className="result-line">{headline}</p>
      <p className="result-score">{scoreLine}</p>
      {reason && <p className="muted">{reason}</p>}
    </Dialog>
  );
}
