import { useEffect, useRef, useState } from "react";
import type { MatchDetail } from "../../api";
import type { ChessClock } from "./useChessGame";

const TICK_MS = 200;

// An online match's clock, between the server's answers. The server says how
// much each side had left when it answered; this counts the running side down
// from when that answer arrived (this device's clock never decides anything),
// and asks the server again the moment it reaches zero — the server ends the
// match on time when it is read, so the answer comes back finished.
export function useMatchClock(match: MatchDetail | null, refresh: () => Promise<void>): ChessClock | null {
  const clock = match?.clock ?? null;
  const running = clock?.running ?? null;
  // How long the running side has used since this answer arrived.
  const [elapsed, setElapsed] = useState<{ match: MatchDetail | null; ms: number }>({ match: null, ms: 0 });
  const asked = useRef<MatchDetail | null>(null);

  useEffect(() => {
    if (!match || running === null || !match.clock) return;
    const arrived = performance.now();
    const budget = match.clock.left[running];
    const timer = window.setInterval(() => {
      const ms = performance.now() - arrived;
      setElapsed({ match, ms });
      // Out of time here: ask once per answer, and let the server say how it ended.
      if (ms >= budget && asked.current !== match) {
        asked.current = match;
        void refresh();
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [match, running, refresh]);

  if (!clock) return null;
  const left: [number, number] = [clock.left[0], clock.left[1]];
  if (running !== null && elapsed.match === match) left[running] = Math.max(0, left[running] - elapsed.ms);
  return { control: clock.control, left, running };
}
