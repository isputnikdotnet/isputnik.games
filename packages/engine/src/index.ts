export * from "./game.js";
export * from "./random.js";
export * from "./registry.js";
export * as Dots from "./dots/index.js";
export { dots } from "./dots/index.js";
export type { DotsMove, DotsOptions, DotsState, BoardSize } from "./dots/rules.js";
export * as StarBattle from "./starbattle/index.js";
export { starbattle } from "./starbattle/index.js";
export type { StarBattleMove, StarBattleOptions, StarBattleState, Vessel, FleetKind, LastShot, ShotResult, Phase as StarBattlePhase } from "./starbattle/rules.js";
