import type { ArcadeDefinition } from "../game.js";
import { INITIAL_INPUT, VARIANTS, createRun, parseInput, parseVariant, periodOf, tick, type TorpedoInput, type TorpedoState, type TorpedoVariant } from "./rules.js";

export const torpedo: ArcadeDefinition<TorpedoVariant, TorpedoState, TorpedoInput> = {
  id: "torpedo",
  variants: VARIANTS,
  initialInput: INITIAL_INPUT,
  parseVariant,
  parseInput,
  createRun,
  tick,
  periodOf,
  scoreOf: (state) => state.score
};

export * from "./rules.js";
