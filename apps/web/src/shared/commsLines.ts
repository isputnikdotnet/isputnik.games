import type { PlayerIndex } from "@isputnik/games-engine";

// The lines of a Comms panel: what every move did, what the players said, and
// the odd line from the game itself. Pages build them from the engine's events
// (GameDefinition.narrate) in the game's own words; this module only knows the
// shape and how talk slots in between the moves.
export type Tone = "good" | "bad" | "neutral";

export interface CommsLine {
  key: string;
  kind: "event" | "say" | "system";
  /** Whose line, seen from this screen; absent on a system line. */
  who?: "you" | "them";
  name?: string;
  text: string;
  result?: { text: string; tone: Tone };
}

export interface Talk {
  id: number;
  by: PlayerIndex;
  text: string;
  /** The move count when it was said. */
  afterMove: number;
}

export interface Speaker {
  who: "you" | "them";
  name: string;
}

/**
 * Events (one per move, in order) with the talk slotted in: a message goes
 * after the move it was said after, before the next one.
 */
export function withTalk(events: CommsLine[], talk: Talk[], speaker: (seat: PlayerIndex) => Speaker): CommsLine[] {
  const out: CommsLine[] = [];
  let next = 0;
  const say = (upTo: number) => {
    while (next < talk.length && talk[next].afterMove <= upTo) {
      const line = talk[next++];
      const { who, name } = speaker(line.by);
      out.push({ key: `say-${line.id}`, kind: "say", who, name, text: line.text });
    }
  };
  events.forEach((event, index) => {
    say(index);
    out.push(event);
  });
  say(Number.POSITIVE_INFINITY);
  return out;
}
