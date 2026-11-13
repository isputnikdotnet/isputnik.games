import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Trash2 } from "lucide-react";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { clockLabel } from "./clockText";
import { deleteShelvedGame, listShelvedGames, type ShelvedGame } from "./storage";

const LEVEL_LABEL = { easy: "chess.setup.levelEasy", normal: "chess.setup.levelNormal", hard: "chess.setup.levelHard" } as const;

// The games put aside on this device (Save and leave), under the new-game
// form: what each one is, how far it got, when it was left — Continue takes it
// back onto the board, Delete throws it away (asked first).
export function ShelvedGames({ onResume }: { onResume: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [games, setGames] = useState<ShelvedGame[]>(() => listShelvedGames());
  const [deleting, setDeleting] = useState<ShelvedGame | null>(null);
  if (games.length === 0) return null;

  const title = (item: ShelvedGame) => {
    const { setup } = item.game;
    return setup.mode === "computer"
      ? t("chess.saved.vsComputer", { level: t(LEVEL_LABEL[setup.level]) })
      : t("chess.saved.twoPlayers");
  };
  const detail = (item: ShelvedGame) => {
    const { state, setup } = item.game;
    const when = new Date(item.savedAt).toLocaleString(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return [
      t("chess.saved.moves", { count: state.moves.length }),
      t(state.toMove === 0 ? "chess.saved.whiteToMove" : "chess.saved.blackToMove"),
      setup.clock ? clockLabel(setup.clock, t) : null,
      t("chess.saved.left", { when })
    ].filter(Boolean).join(" · ");
  };

  return (
    <section className="setup-card shelved-games" aria-labelledby="shelved-games-title">
      <h2 id="shelved-games-title">{t("chess.saved.title")}</h2>
      <ul className="shelved-list">
        {games.map((item) => (
          <li key={item.id} className="shelved-row">
            <span className="shelved-main">
              <strong>{title(item)}</strong>
              <span className="muted">{detail(item)}</span>
            </span>
            <span className="shelved-actions">
              <Button variant="primary" onClick={() => onResume(item.id)}>
                <Play size={16} aria-hidden="true" /> {t("chess.saved.continue")}
              </Button>
              <Button variant="icon" aria-label={t("chess.saved.delete")} title={t("chess.saved.delete")} onClick={() => setDeleting(item)}>
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {deleting && (
        <Dialog
          title={t("chess.saved.confirmTitle", { game: title(deleting) })}
          confirmLabel={t("chess.saved.confirmDelete")}
          cancelLabel={t("chess.saved.keep")}
          danger
          onConfirm={() => {
            deleteShelvedGame(deleting.id);
            setGames(listShelvedGames());
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        >
          {t("chess.saved.confirmBody")}
        </Dialog>
      )}
    </section>
  );
}
