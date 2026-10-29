import { Torpedo, type ShipKind, type TorpedoLane, type TorpedoShip } from "@isputnik/games-engine";

// Where things sit in the scene. The field of attack is 1000 view units
// across with dead ahead at x 500; the sea runs on past it either side. The
// view turns (owner, 2026-10-29, after the old cabinet): the lens shows a
// stretch of the scene SPAN wide with the sight always in its middle, and the
// scene moves past as the periscope turns. A deep lens (a phone's) shows a
// wider stretch and more sea below the horizon.

export const LENS_H = 440;
/** How much of the scene a lens shows across: about ±20° wide, ±26° deep. */
export const SPAN = { wide: 560, deep: 720 } as const;
export const FIELD_W = 1000;
/** View units per bearing unit: the field of attack spans the lens. */
export const K = FIELD_W / (2 * Torpedo.FIELD_HALF);
export const CENTRE = 500;
export const HORIZON = 207;
/** The tube, dead ahead at the foot of the lens. */
export const tubeOf = (bottom: number) => bottom - 12;

/** The waterline of each lane: far ships sit on the horizon, near ones low in
 *  the lens. A torpedo runs straight from the tube to the sight on the
 *  horizon, and the engine counts it as far over as Torpedo.REACH says when it
 *  crosses a lane, so each lane lies where that straight course is that far
 *  over. A deeper lens spreads the lanes down it: the sea opens out, and the
 *  course stays straight. */
export function laneYs(tubeY: number): Record<TorpedoLane, number> {
  const at = (lane: TorpedoLane) => tubeY - (Torpedo.REACH[lane] / 100) * (tubeY - HORIZON);
  return { far: at("far"), mid: at("mid"), near: at("near") };
}

/** The x of something at a bearing. */
export const screenX = (bearing: number) => CENTRE + bearing * K;

/** A ship's drawn width: exactly what the engine counts as a hit. */
export const shipWidth = (kind: ShipKind) => 2 * Torpedo.SHIPS[kind].half * K;

/** The stretch of the scene a lens of this shape shows with the sight dead
 *  ahead: SPAN across, centred on x 500, and as tall as the lens's shape asks,
 *  the horizon a little above the middle (in the upper part of a deep lens, so
 *  its depth goes to the sea the torpedoes cross). The scene turns under it. */
export function viewOf(aspect: number): { left: number; width: number; top: number; height: number } {
  const deep = aspect < 1.2;
  const width = deep ? SPAN.deep : SPAN.wide;
  const height = width / aspect;
  return { left: CENTRE - width / 2, width, top: HORIZON - height * (deep ? 0.38 : 0.47), height };
}

/** Where the course of a torpedo fired down `bearing` is at height `y`:
 *  dead ahead at the tube, under the sight on the horizon. */
export const courseX = (bearing: number, y: number, tubeY: number) => CENTRE + (screenX(bearing) - CENTRE) * ((tubeY - y) / (tubeY - HORIZON));

/** The torpedo's place `run` ticks out on its course, from the tube to the
 *  lane it has reached. */
export function wakePoint(bearing: number, run: number, tubeY: number): { x: number; y: number; size: number } {
  const { RANGE } = Torpedo;
  const lanes = laneYs(tubeY);
  const stops: [number, number][] = [[0, tubeY], [RANGE.near, lanes.near], [RANGE.mid, lanes.mid], [RANGE.far, lanes.far]];
  let y = lanes.far;
  for (let i = 1; i < stops.length; i++) {
    const [r0, y0] = stops[i - 1];
    const [r1, y1] = stops[i];
    if (run <= r1) {
      y = y0 + ((run - r0) / (r1 - r0)) * (y1 - y0);
      break;
    }
  }
  const depth = run / RANGE.far;
  return { x: courseX(bearing, y, tubeY), y, size: 16 - depth * 11 };
}

/** The ship's draw scale: its hull, 100 units long, to its width in the lens. */
export const shipScale = (ship: Pick<TorpedoShip, "kind">) => shipWidth(ship.kind) / 100;

/** A score as the periscope prints it, thousands set apart: 1 500. */
export const formatScore = (score: number) => score.toLocaleString("ru-RU");
