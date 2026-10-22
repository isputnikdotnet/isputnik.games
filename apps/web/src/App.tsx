import { useTranslation } from "react-i18next";
import { getGame } from "@isputnik/games-engine";
import { SessionProvider, useSession } from "./session";
import { useRoute } from "./router";
import { Shell } from "./shared/Shell";
import { MessageBox } from "./shared/MessageBox";
import { LobbyPage } from "./pages/LobbyPage";
import { DotsPage } from "./games/dots/DotsPage";
import { DotsMatchPage } from "./games/dots/DotsMatchPage";

function Routes() {
  const route = useRoute();
  const session = useSession();
  const { t } = useTranslation();

  if (session.status === "loading") {
    return <p className="app-status muted">{t("app.loading")}</p>;
  }
  if (session.status === "signed-out") {
    return <MessageBox tone="warning" title={t("app.signedOutTitle")}>{t("app.signedOutBody")}</MessageBox>;
  }
  if (session.status === "unavailable") {
    return <MessageBox tone="error" title={t("app.unavailableTitle")}>{t("app.unavailableBody")}</MessageBox>;
  }

  if (route.name === "lobby") return <LobbyPage />;
  // One page per game, and one per game's online match; the registry says which
  // games exist, this says how each one is played on screen. A new game adds
  // its branches here.
  if (route.name === "game" && getGame(route.gameId)) {
    if (route.gameId === "dots") return <DotsPage />;
  }
  if (route.name === "match" && getGame(route.gameId)) {
    if (route.gameId === "dots") return <DotsMatchPage matchId={route.matchId} />;
  }
  return <MessageBox tone="info" title={t("app.notFound")} />;
}

export function App() {
  return (
    <SessionProvider>
      <Shell>
        <Routes />
      </Shell>
    </SessionProvider>
  );
}
