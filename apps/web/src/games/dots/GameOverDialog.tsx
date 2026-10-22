import { useTranslation } from "react-i18next";
import { Dialog } from "../../shared/Dialog";

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
      title={t("dots.end.title")}
      confirmLabel={primary.label}
      cancelLabel={secondary?.label}
      onConfirm={primary.onClick}
      onCancel={secondary?.onClick}
      onClose={onClose}
    >
      <p className="dots-result-line">{headline}</p>
      <p className="dots-result-score">{scoreLine}</p>
      {reason && <p className="muted">{reason}</p>}
    </Dialog>
  );
}
