import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchMatch, type MatchDetail } from "../../api";

// One online match, kept fresh by polling: every few seconds while the other
// player is to move or has yet to accept, more slowly while it is your move
// (they could still resign), and not at all once it is over. The tab coming
// back into view refreshes at once, so a phone unlocked after a while does not
// wait out a whole interval.
const THEIRS_MS = 2500;
const MINE_MS = 10000;

export interface MatchController {
  match: MatchDetail | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** Adopt a match the server just answered with (after a move, a resignation). */
  adopt: (match: MatchDetail) => void;
}

export function useMatch(id: string, myId: string): MatchController {
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchMatch(id);
      if (!alive.current) return;
      setMatch(next);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof ApiError ? err.message : "network");
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  const mySeat = match ? (match.players[0].id === myId ? 0 : 1) : null;
  const waitingOnThem = Boolean(match && (match.status === "invited" || (match.status === "playing" && match.turn !== mySeat)));
  const open = Boolean(match && (match.status === "invited" || match.status === "playing"));

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refresh(), waitingOnThem ? THEIRS_MS : MINE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, waitingOnThem, refresh]);

  return { match, error, refresh, adopt: setMatch };
}
