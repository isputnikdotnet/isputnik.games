import { useTranslation } from "react-i18next";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { ChessPiece } from "./pieces";
import { CHESS_THEMES, setChessTheme, useChessTheme, type ChessTheme } from "./theme";

// Board style: each theme as a corner of its own board, a White and a Black
// piece on it, so the choice is made by looking rather than by name. A tap
// changes the board behind the dialog at once.
export function ChessThemeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const current = useChessTheme();
  return (
    <Dialog title={t("chess.theme.title")} cancelLabel={t("chess.theme.done")} onClose={onClose}>
      <div className="chess-themes" role="radiogroup" aria-label={t("chess.theme.title")}>
        {CHESS_THEMES.map((theme) => (
          <ThemeSwatch key={theme} theme={theme} selected={theme === current} />
        ))}
      </div>
    </Dialog>
  );
}

function ThemeSwatch({ theme, selected }: { theme: ChessTheme; selected: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="bare"
      className={`chess-theme-choice${selected ? " is-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={() => setChessTheme(theme)}
    >
      <span className="chess-theme-board" data-chess-theme={theme} aria-hidden="true">
        <span className="chess-square is-light"><ChessPiece letter="q" /></span>
        <span className="chess-square is-dark" />
        <span className="chess-square is-dark" />
        <span className="chess-square is-light"><ChessPiece letter="N" /></span>
      </span>
      <span className="chess-theme-name">{t(`chess.theme.${theme}`)}</span>
      <span className="chess-theme-hint muted">{t(`chess.theme.${theme}Hint`)}</span>
    </Button>
  );
}
