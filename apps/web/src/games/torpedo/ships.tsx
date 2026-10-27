import type { ShipKind } from "@isputnik/games-engine";

// The four ships as silhouettes against the dusk, the house's own drawings:
// each hull 100 units long, bow to the right, waterline at y 0. A ship
// heading left is the same drawing mirrored.
export const SHIP_PATHS: Record<ShipKind, string> = {
  // Long and low, the bridge and funnel aft, a pipe deck along the middle.
  tanker:
    "M0 -7 L100 -7 L96 0 L4 0 Z M5 -7 V-17 H19 V-7 Z M8 -17 V-23 H13 V-17 Z M22 -7 V-9 H86 V-7 Z M30 -9 V-11 H34 V-9 Z M52 -9 V-11 H56 V-9 Z M74 -9 V-11 H78 V-9 Z M89 -7 V-14 H90.5 V-7 Z",
  // A raised bow, containers forward, two derricks and the bridge aft.
  cargo:
    "M0 -9 L88 -9 L100 -13 L94 0 L5 0 Z M14 -9 V-22 H28 V-9 Z M18 -22 V-28 H24 V-22 Z M34 -9 V-16 H82 V-9 Z M40 -16 V-21 H58 V-16 Z M62 -16 V-20 H78 V-16 Z M48 -21 V-31 H49.6 V-21 Z M49 -31 L60 -23 L59 -22 L49 -29 Z M70 -20 V-30 H71.6 V-20 Z M71 -30 L81 -22 L80 -21 L71 -28 Z",
  // Sleek, a raked bow, turrets fore and aft, a lattice mast amidships.
  destroyer:
    "M0 -6 L84 -7 L100 -10 L95 0 L3 0 Z M30 -7 V-14 H56 V-7 Z M50 -14 V-20 H58 V-14 Z M36 -14 V-20 H42 V-14 Z M45 -14 V-30 H46.4 V-14 Z M41 -25 H51 V-24 H41 Z M68 -7 V-11 H77 V-7 Z M77 -10 H87 V-9 H77 Z M12 -6 V-10 H21 V-6 Z M4 -9 H12 V-8 H4 Z",
  // Small and quick: a cabin with a raked windscreen and a whip mast.
  patrol:
    "M0 -6 L80 -7 L100 -11 L90 0 L6 0 Z M24 -7 V-17 H52 L62 -7 Z M36 -17 V-27 H38 V-17 Z M8 -7 V-10 H16 V-7 Z"
};

/** A ship's height above the waterline, in hull units, for its burst and smoke. */
export const SHIP_HEIGHT: Record<ShipKind, number> = { tanker: 23, cargo: 31, destroyer: 30, patrol: 27 };

export function ShipSilhouette({ kind, fill }: { kind: ShipKind; fill: string }) {
  return <path d={SHIP_PATHS[kind]} fill={fill} />;
}
