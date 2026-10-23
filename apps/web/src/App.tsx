import { useTranslation } from "react-i18next";
import { getGame } from "@isputnik/games-engine";
import { SessionProvider, useSession } from "./session";
import { useRoute } from "./router";
import { Shell } from "./shared/Shell";
import { MessageBox } from "./shared/MessageBox";
import { LobbyPage } from "./pages/LobbyPage";
import { GuestLobby } from "./pages/GuestLobby";
import { DotsPage } from "./games/dots/DotsPage";
import { DotsMatchPage } from "./games/dots/DotsMatchPage";
import { StarBattlePage } from "./games/starbattle/StarBattlePage";
import { StarBattleMatchPage } from "./games/starbattle/StarBattleMatchPage";

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

  // A guest's lobby is the one match their link is for; there is nothing else to pick.
  if (route.name === "lobby") return session.user.role === "guest" ? <GuestLobby /> : <LobbyPage />;
  // One page per game, and one per game's online match; the registry says which
  // games exist, this says how each one is played on screen. A new game adds
  // its branches here.
  if (route.name === "game" && getGame(route.gameId)) {
    if (route.gameId === "dots") return <DotsPage />;
    if (route.gameId === "starbattle") return <StarBattlePage />;
  }
  if (route.name === "match" && getGame(route.gameId)) {
    if (route.gameId === "dots") return <DotsMatchPage matchId={route.matchId} />;
    if (route.gameId === "starbattle") return <StarBattleMatchPage matchId={route.matchId} />;
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
