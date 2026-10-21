import { useTranslation } from "react-i18next";
import { CircleDot, type LucideIcon } from "lucide-react";
import { GAMES } from "@isputnik/games-engine";
import { follow, href } from "../router";
import { loadDotsGame } from "../games/dots/storage";

// What the lobby shows for each game in the engine's registry: an icon and the
// keys of its name and summary. A game without an entry here is not offered.
const CATALOG: Record<string, { icon: LucideIcon; name: "games.dots.name"; summary: "games.dots.summary"; inProgress: () => boolean }> = {
  dots: {
    icon: CircleDot,
    name: "games.dots.name",
    summary: "games.dots.summary",
    inProgress: () => loadDotsGame()?.state.status.kind === "playing"
  }
};

export function LobbyPage() {
  const { t } = useTranslation();
  return (
    <section className="lobby">
      <header className="page-head">
        <h1>{t("lobby.title")}</h1>
        <p className="muted">{t("lobby.lead")}</p>
      </header>
      <div className="lobby-grid">
        {GAMES.map((game) => {
          const entry = CATALOG[game.id];
          if (!entry) return null;
          const Icon = entry.icon;
          const to = href(game.id);
          const resuming = entry.inProgress();
          return (
            <a key={game.id} className="game-card" href={to} onClick={(event) => follow(event, to)}>
              <span className="game-card-icon"><Icon size={34} aria-hidden="true" /></span>
              <span className="game-card-text">
                <strong>{t(entry.name)}</strong>
                <span className="muted">{t(entry.summary)}</span>
              </span>
              <span className="game-card-cta">{resuming ? t("lobby.continue") : t("lobby.play")}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
