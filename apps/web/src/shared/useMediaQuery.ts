import { useEffect, useState } from "react";

/** Whether a media query holds, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** The arena's phone layout: the breakpoint at which the two sectors stop fitting side by side. */
export const PHONE_ARENA = "(max-width: 900px)";

/** A phone: the width at which the tab bar shows (app.css .mobile-nav) and the
 *  game pages trade their chrome for room — no way back above the title, no
 *  description, a smaller scoreboard. */
export const PHONE = "(max-width: 740px)";
