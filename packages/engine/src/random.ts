// A small seeded generator (mulberry32) so a computer opponent can be replayed
// in a test, and so phase 2 can seed one per match and audit its moves.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    const [value, next] = randomStep(a);
    a = next;
    return value;
  };
}

/** One draw of the same generator as a pure step, for state that must stay
 *  plain JSON (an arcade run keeps its generator in the state): the value in
 *  [0, 1) and the generator's next state. */
export function randomStep(state: number): [value: number, next: number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
