import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

// The end of a game, announced where it cannot be missed. The board stays
// behind it; closing it (Escape, the backdrop) leaves the result in the panel.
export function GameOverDialog({
  headline,
  scoreLine,
  reason,
  primary,
  secondary,
  review,
  onClose
}: {
  /** "Blue wins", "You win", "A draw". */
  headline: string;
  scoreLine: string;
  reason: string | null;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  /** Step back through the game just played (chess, once it is kept). */
  review?: { label: string; onClick: () => void };
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
      footer={review && (
        <Button variant="text" className="game-over-review" onClick={review.onClick}>
          <History size={16} aria-hidden="true" /> {review.label}
        </Button>
      )}
    >
      <p className="result-line">{headline}</p>
      <p className="result-score">{scoreLine}</p>
      {reason && <p className="muted">{reason}</p>}
    </Dialog>
  );
}
