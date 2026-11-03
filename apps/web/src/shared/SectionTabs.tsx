import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";
import { CATALOG, LOBBY_GAME_IDS } from "../games/catalog";
import { follow, href, type Route } from "../router";

/** Which tab a page lights: the lobby is the overview, everything else its game's. */
export function tabFor(route: Route): string | null {
  if (route.name === "lobby") return "overview";
  if (route.name === "game" || route.name === "match") return route.gameId;
  if (route.name === "puzzles" || route.name === "myGames" || route.name === "review") return "chess";
  return null;
}

// The games' own destinations as one row of tabs under the bar, the way each
// section of the home app has its row (Video: Overview · Shows · Movies): the
// lobby, then every game in the lobby's order. A long row scrolls sideways and
// keeps the page you are on in view.
export function SectionTabs({ route }: { route: Route }) {
  const { t } = useTranslation();
  const row = useRef<HTMLElement>(null);
  const active = tabFor(route);

  useEffect(() => {
    const node = row.current;
    const tab = node?.querySelector<HTMLElement>(".topbar-tab.is-active");
    if (!node || !tab) return;
    node.scrollLeft = tab.offsetLeft - node.offsetLeft - (node.clientWidth - tab.offsetWidth) / 2;
  }, [active]);

  const tab = (key: string, to: string, label: string, Icon: typeof LayoutGrid) => (
    <a
      key={key}
      className={`topbar-tab${active === key ? " is-active" : ""}`}
      href={to}
      aria-current={active === key ? "page" : undefined}
      onClick={(event) => follow(event, to)}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </a>
  );

  return (
    <nav className="topbar-tabs" ref={row} aria-label={t("top.gamesTabs")}>
      {tab("overview", href(), t("top.overview"), LayoutGrid)}
      <span className="topbar-tabs-divider" aria-hidden="true" />
      {LOBBY_GAME_IDS.map((gameId) => {
        const entry = CATALOG[gameId];
        return entry ? tab(gameId, href(gameId), t(entry.name), entry.icon) : null;
      })}
    </nav>
  );
}
