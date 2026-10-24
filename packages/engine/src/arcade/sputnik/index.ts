import type { ArcadeDefinition } from "../game.js";
import { VARIANTS, createRun, parseInput, parseVariant, periodOf, tick, type Rail, type SputnikState, type SputnikVariant } from "./rules.js";

export const sputnik: ArcadeDefinition<SputnikVariant, SputnikState, Rail> = {
  id: "sputnik",
  variants: VARIANTS,
  initialInput: 0,
  parseVariant,
  parseInput,
  createRun,
  tick,
  periodOf,
  scoreOf: (state) => state.caught
};

export * from "./rules.js";
