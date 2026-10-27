import { Torpedo, type ShipKind, type TorpedoLane, type TorpedoShip } from "@isputnik/games-engine";

// Where things sit in the lens. The lens is drawn in a viewBox 440 high whose
// width follows the lens's own shape (wide on a desktop, near round on a
// phone), centred on x 500: the crosshair. A bearing unit (a tenth of a
// degree) is K view units across whatever the width, so a phone simply sees
// less of the sea either side.

export const LENS_H = 440;
/** View units per bearing unit: the desktop lens, 1000 wide, spans the engine's field of view. */
export const K = 1000 / (2 * Torpedo.VIEW_HALF);
export const CENTRE = 500;
export const HORIZON = 207;
/** The waterline of each lane: far ships sit on the horizon, near ones low in the lens. */
export const LANE_Y: Record<TorpedoLane, number> = { far: 214, mid: 240, near: 284 };
/** Where the torpedo leaves the boat: under the crosshair at the foot of the lens. */
export const TUBE_Y = 430;

/** The x of something at a world bearing, seen with the periscope on `bearing`. */
export const screenX = (world: number, bearing: number) => CENTRE + (world - bearing) * K;

/** A ship's drawn width: exactly what the engine counts as a hit. */
export const shipWidth = (kind: ShipKind) => 2 * Torpedo.SHIPS[kind].half * K;

/** The torpedo's place `run` ticks out: straight down its bearing, closing in
 *  on the boat's own position near the tube (perspective), and climbing the
 *  lens from the tube to the lane it has reached. */
export function wakePoint(bearing: number, run: number, periscope: number): { x: number; y: number; size: number } {
  const { RANGE } = Torpedo;
  const stops: [number, number][] = [[0, TUBE_Y], [RANGE.near, LANE_Y.near], [RANGE.mid, LANE_Y.mid], [RANGE.far, LANE_Y.far]];
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
  const spread = 0.25 + 0.75 * Math.min(1, depth * 1.6);
  return { x: CENTRE + (bearing - periscope) * K * spread, y, size: 16 - depth * 11 };
}

/** The ship's draw scale: its hull, 100 units long, to its width in the lens. */
export const shipScale = (ship: Pick<TorpedoShip, "kind">) => shipWidth(ship.kind) / 100;

/** A score as the periscope prints it, thousands set apart: 1 500. */
export const formatScore = (score: number) => score.toLocaleString("ru-RU");
