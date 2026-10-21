import { useEffect, useState } from "react";

export const BASE = "/games";

export type Route =
  | { name: "lobby" }
  | { name: "game"; gameId: string }
  | { name: "notFound" };

export function parseRoute(pathname: string): Route {
  let rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  rest = rest.replace(/^\/+|\/+$/g, "");
  if (rest === "") return { name: "lobby" };
  const [gameId, ...more] = rest.split("/");
  if (more.length === 0 && /^[a-z][a-z0-9-]*$/.test(gameId)) return { name: "game", gameId };
  return { name: "notFound" };
}

/** An in-app address: href("dots") → "/games/dots". */
export function href(path = ""): string {
  return path ? `${BASE}/${path}` : `${BASE}/`;
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
