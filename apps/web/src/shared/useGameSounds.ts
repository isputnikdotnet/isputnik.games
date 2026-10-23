import { useEffect, useRef } from "react";
import type { GameEvent, GameStatus, PlayerIndex } from "@isputnik/games-engine";
import type { MatchDetail } from "../api";
import { play, type Cue } from "./sound";

// What a game page tells the sounds: the same feed of events the Comms panel
// reads, where the game stands, and (online) what was said. The cues come from
// what changed since the last render — never from what was already there when
// the page opened, so a match opened mid-game does not replay its history, and
// an undo or a new game is silent.
export interface SoundState {
  game: "dots" | "starbattle";
  feed: readonly GameEvent[];
  /** This screen's seat; null when both seats play here (hot-seat Dots). */
  me: PlayerIndex | null;
  status: "playing" | "finished" | "other";
  turn: PlayerIndex | null;
  winner: PlayerIndex | null;
  /** An online match: chime when the move comes back to you. */
  online?: boolean;
  messages?: readonly { id: number; by: PlayerIndex }[];
}

/** A batch of moves landing at once (a poll after a run of hits) sounds its last few. */
const MOST_EVENTS = 3;

export function eventCues(game: SoundState["game"], event: GameEvent, me: PlayerIndex | null): Cue[] {
  const mine = me === null ? event.by === 0 : event.by === me;
  if (game === "dots") {
    const out: Cue[] = [mine ? "dot" : "dotTheirs"];
    if ((event.captured as number) > 0) out.push(me === null || mine ? "capture" : "captured");
    else if (event.lost) out.push("lost");
    return out;
  }
  if (event.kind === "deploy") return ["deploy"];
  return ["fire", event.result as "miss" | "hit" | "destroyed"];
}

export function cuesBetween(prev: SoundState | null, next: SoundState): Cue[] {
  if (!prev || prev.game !== next.game) return [];
  const out: Cue[] = [];

  if (next.feed.length > prev.feed.length) {
    next.feed.slice(prev.feed.length).slice(-MOST_EVENTS)
      .forEach((event) => out.push(...eventCues(next.game, event, next.me)));
  }

  if (prev.status === "playing" && next.status === "finished") {
    out.push(next.winner === null ? "draw" : next.me === null || next.winner === next.me ? "win" : "lose");
  } else if (next.online && next.status === "playing" && next.turn === next.me
    && !(prev.status === "playing" && prev.turn === next.me)) {
    out.push("yourMove");
  }

  const heard = new Set((prev.messages ?? []).map((message) => message.id));
  if ((next.messages ?? []).some((message) => !heard.has(message.id) && message.by !== next.me)) out.push("message");

  return out;
}

/** A local game as the sounds read it. */
export function localSound(game: SoundState["game"], feed: readonly GameEvent[], me: PlayerIndex | null, status: GameStatus): SoundState {
  return {
    game,
    feed,
    me,
    status: status.kind,
    turn: status.kind === "playing" ? status.turn : null,
    winner: status.kind === "finished" ? status.winner : null
  };
}

/** An online match as the sounds read it, from this member's seat. */
export function matchSound(game: SoundState["game"], match: MatchDetail | null, myId: string): SoundState | null {
  if (!match) return null;
  return {
    game,
    feed: match.feed,
    me: match.players[0].id === myId ? 0 : 1,
    status: match.status === "playing" || match.status === "finished" ? match.status : "other",
    turn: match.turn,
    winner: match.winner,
    online: true,
    messages: match.messages
  };
}

/** Plays `cue` when an id joins the list (a new invitation in the lobby) —
 *  never for the ones there when the list first loaded; pass null until then. */
export function useNewcomerCue(ids: readonly string[] | null, cue: Cue): void {
  const seen = useRef<Set<string> | null>(null);
  const key = ids?.join(",") ?? null;
  useEffect(() => {
    if (key === null) return;
    const now = key === "" ? [] : key.split(",");
    const fresh = seen.current !== null && now.some((id) => !seen.current!.has(id));
    seen.current = new Set(now);
    if (fresh) play(cue);
  }, [key, cue]);
}

/** Plays what changed in a game since the last render; pass null while nothing is loaded. */
export function useGameSounds(state: SoundState | null): void {
  const last = useRef<SoundState | null>(null);
  useEffect(() => {
    if (!state) return;
    // A feed that shrank (an undo, a new game) starts the count again, silently.
    const prev = last.current && state.feed.length >= last.current.feed.length ? last.current : null;
    last.current = state;
    play(...cuesBetween(prev, state));
  });
}
