import { Torpedo, type ShipKind, type TorpedoLane, type TorpedoShip } from "@isputnik/games-engine";

// Where things sit in the lens. The view holds still: the lens always shows
// the whole field of attack, 1000 view units across, with dead ahead at x 500.
// Only the sight moves, left and right along the horizon. A lens of another
// shape (a phone's, taller for its width) shows more sky and sea above and
// below, never less of the field: the scene is drawn LENS_H high on a wide
// lens and the view grows taller around it.

export const LENS_H = 440;
export const FIELD_W = 1000;
/** View units per bearing unit: the field of attack spans the lens. */
export const K = FIELD_W / (2 * Torpedo.FIELD_HALF);
export const CENTRE = 500;
export const HORIZON = 207;
/** The waterline of each lane: far ships sit on the horizon, near ones low in the lens. */
export const LANE_Y: Record<TorpedoLane, number> = { far: 214, mid: 240, near: 284 };

/** The x of something at a bearing. */
export const screenX = (bearing: number) => CENTRE + bearing * K;

/** A ship's drawn width: exactly what the engine counts as a hit. */
export const shipWidth = (kind: ShipKind) => 2 * Torpedo.SHIPS[kind].half * K;

/** The part of the scene a lens of this shape shows: the full width, and a
 *  height that keeps the horizon a little above the middle. */
export function viewOf(aspect: number): { top: number; height: number } {
  const height = Math.max(LENS_H, FIELD_W / aspect);
  return { top: height === LENS_H ? 0 : HORIZON - height * 0.42, height };
}

/** The torpedo's place `run` ticks out: straight up its bearing from the
 *  tube at the foot of the lens to the lane it has reached. */
export function wakePoint(bearing: number, run: number, tubeY: number): { x: number; y: number; size: number } {
  const { RANGE } = Torpedo;
  const stops: [number, number][] = [[0, tubeY], [RANGE.near, LANE_Y.near], [RANGE.mid, LANE_Y.mid], [RANGE.far, LANE_Y.far]];
  let y = LANE_Y.far;
  for (let i = 1; i < stops.length; i++) {
    const [r0, y0] = stops[i - 1];
    const [r1, y1] = stops[i];
    if (run <= r1) {
      y = y0 + ((run - r0) / (r1 - r0)) * (y1 - y0);
      break;
    }
  }
  const depth = run / RANGE.far;
  return { x: screenX(bearing), y, size: 16 - depth * 11 };
}

/** The ship's draw scale: its hull, 100 units long, to its width in the lens. */
export const shipScale = (ship: Pick<TorpedoShip, "kind">) => shipWidth(ship.kind) / 100;

/** A score as the periscope prints it, thousands set apart: 1 500. */
export const formatScore = (score: number) => score.toLocaleString("ru-RU");
