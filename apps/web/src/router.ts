import { useEffect, useState } from "react";

export const BASE = "/games";

export type Route =
  | { name: "lobby" }
  | { name: "game"; gameId: string }
  | { name: "match"; gameId: string; matchId: string }
  | { name: "puzzles" }
  | { name: "myGames" }
  | { name: "review"; source: "record" | "match"; id: string }
  | { name: "notFound" };

const ID = /^[A-Za-z0-9_-]+$/;

/** Game ids that were renamed: an old address (a bookmark, a card on the home
 *  app from before its upgrade) opens the game under its new id. */
const RENAMED_GAMES: Record<string, string> = { seabattle: "starbattle" };

export function parseRoute(pathname: string): Route {
  let rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  rest = rest.replace(/^\/+|\/+$/g, "");
  if (rest === "") return { name: "lobby" };
  const parts = rest.split("/");
  const gameId = RENAMED_GAMES[parts[0]] ?? parts[0];
  if (!/^[a-z][a-z0-9-]*$/.test(gameId)) return { name: "notFound" };
  if (parts.length === 1) return { name: "game", gameId };
  // /games/chess/puzzles — chess puzzles.
  if (parts.length === 2 && gameId === "chess" && parts[1] === "puzzles") return { name: "puzzles" };
  // /games/chess/games — My games; /games/chess/review/<id> a game kept from
  // one device, /games/chess/review/m/<match id> an online one, to step through.
  if (parts.length === 2 && gameId === "chess" && parts[1] === "games") return { name: "myGames" };
  if (parts.length === 3 && gameId === "chess" && parts[1] === "review" && ID.test(parts[2])) return { name: "review", source: "record", id: parts[2] };
  if (parts.length === 4 && gameId === "chess" && parts[1] === "review" && parts[2] === "m" && ID.test(parts[3])) return { name: "review", source: "match", id: parts[3] };
  // /games/<game>/m/<match id> — an online match.
  if (parts.length === 3 && parts[1] === "m" && ID.test(parts[2])) return { name: "match", gameId, matchId: parts[2] };
  return { name: "notFound" };
}

/** An in-app address: href("dots") → "/games/dots". */
export function href(path = ""): string {
  return path ? `${BASE}/${path}` : `${BASE}/`;
}

export function matchHref(gameId: string, matchId: string): string {
  return href(`${gameId}/m/${matchId}`);
}

const listeners = new Set<() => void>();

export function navigate(to: string): void {
  if (window.location.pathname === to) return;
  window.history.pushState(null, "", to);
  listeners.forEach((listener) => listener());
}

/** Click handler for an in-app link: SPA navigation unless the click asks for a
 *  new tab (modifier keys, middle button). */
export function follow(event: React.MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(to);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}
