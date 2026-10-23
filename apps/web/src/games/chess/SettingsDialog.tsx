import { useTranslation } from "react-i18next";
import { Button } from "../../shared/Button";
import { Choice } from "../../shared/Choice";
import { Dialog } from "../../shared/Dialog";
import { ChessPiece } from "./pieces";
import { CHESS_THEMES, setChessTheme, useChessTheme, type ChessTheme } from "./theme";

// The game's settings, one window off the stage so the panel keeps to the
// game: a level when there is one (the computer's, the puzzles'), and always
// the board style — each
// theme as a corner of its own board with a White and a Black piece, chosen
// by looking rather than by name. Every change shows on the board at once.
export interface LevelChoice<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function ChessSettingsDialog<T extends string>({
  level,
  onClose
}: {
  /** Against the computer or in puzzles; an online or one-screen game has none. */
  level?: LevelChoice<T>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const current = useChessTheme();
  return (
    <Dialog title={t("chess.settings.title")} cancelLabel={t("chess.settings.done")} onClose={onClose}>
      <div className="chess-settings">
        {level && <Choice<T> label={level.label} value={level.value} options={level.options} onChange={level.onChange} />}
        <div className="setup-row">
          <span className="setup-label" id="chess-theme-label">{t("chess.theme.title")}</span>
          <div className="chess-themes" role="radiogroup" aria-labelledby="chess-theme-label">
            {CHESS_THEMES.map((theme) => (
              <ThemeSwatch key={theme} theme={theme} selected={theme === current} />
            ))}
          </div>
        </div>
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
