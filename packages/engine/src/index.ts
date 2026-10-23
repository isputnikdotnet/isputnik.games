export * from "./game.js";
export * from "./random.js";
export * from "./registry.js";
export * as Dots from "./dots/index.js";
export { dots } from "./dots/index.js";
export type { DotsMove, DotsOptions, DotsState, BoardSize } from "./dots/rules.js";
export * as SeaBattle from "./seabattle/index.js";
export { seabattle } from "./seabattle/index.js";
export type { SeaBattleMove, SeaBattleOptions, SeaBattleState, Ship, FleetKind, LastShot, ShotResult, Phase as SeaBattlePhase } from "./seabattle/rules.js";
