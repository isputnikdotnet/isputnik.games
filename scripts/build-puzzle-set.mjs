// Builds apps/server/src/puzzle-set.ts — the chess puzzles the server offers —
// from the Lichess puzzle database (CC0, https://database.lichess.org/#puzzles):
//
//   node scripts/build-puzzle-set.mjs <path to lichess_db_puzzle.csv.zst>
//
// The download (~300 MB) stays outside the repo; only the picked set goes in.
// It keeps well-tried, well-liked puzzles whose rating has settled, spread
// evenly over each level's range (PUZZLE_LEVEL_FLOOR in the engine), and
// replays every line through our own rules so a puzzle the engine would
// refuse never ships. Needs the engine built (npm run build -w packages/engine).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Chess } from "../packages/engine/dist/index.js";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/build-puzzle-set.mjs <lichess_db_puzzle.csv.zst>");
  process.exit(1);
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../apps/server/src/puzzle-set.ts");

// Each level's range in steps of 50 points, a few puzzles per step.
const RANGES = { veryEasy: [600, 900], easy: [900, 1300], medium: [1300, 1700], hard: [1700, 2100], expert: [2100, 2600] };
const PER_LEVEL = 200;
const STEP = 50;
const buckets = new Map();
for (const [level, [low, high]] of Object.entries(RANGES)) {
  const steps = (high - low) / STEP;
  for (let i = 0; i < steps; i++) buckets.set(low + i * STEP, { level, want: Math.ceil(PER_LEVEL / steps), got: [] });
}
// Then, so every kind of puzzle (Chess.PUZZLE_TYPES) can be asked for at every
// level, up to PER_TYPE more of each kind per level — taken only once a line
// misses the even spread, so that spread (and the ids members have tried) stays put.
const PER_TYPE = 40;
const typed = new Map();
for (const level of Object.keys(RANGES)) for (const type of Chess.PUZZLE_TYPES) typed.set(`${type}:${level}`, []);
const levelOf = (rating) => Object.entries(RANGES).find(([, [low, high]]) => rating >= low && rating < high)?.[0];
const open = () => [...buckets.values()].some((bucket) => bucket.got.length < bucket.want)
  || [...typed.values()].some((got) => got.length < PER_TYPE);

function valid(fen, moves) {
  try {
    let state = Chess.fromFen(fen);
    for (const uci of moves) state = Chess.applyMove(state, Chess.uciMove(uci));
    return true;
  } catch {
    return false;
  }
}

// Lichess compresses with pzstd: many independent frames, each after a small
// skippable frame that holds its size. Node's decoder stops at the first
// skippable frame, so the sizes say where each frame is and each is decoded
// on its own, one after the other.
function frames(file) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(12);
  const out = [];
  let offset = 0;
  while (offset < size) {
    fs.readSync(fd, head, 0, 12, offset);
    if ((head.readUInt32LE(0) & 0xfffffff0) !== 0x184d2a50) {
      // A plain frame with no size before it: the rest of the file.
      out.push([offset, size - 1]);
      break;
    }
    const skip = head.readUInt32LE(4);
    if (skip !== 4) {
      offset += 8 + skip; // some other skippable frame
      continue;
    }
    const length = head.readUInt32LE(8);
    out.push([offset + 12, offset + 12 + length - 1]);
    offset += 12 + length;
  }
  fs.closeSync(fd);
  return out;
}

async function* text(file) {
  for (const [start, end] of frames(file)) {
    yield* fs.createReadStream(file, { start, end }).pipe(zlib.createZstdDecompress());
  }
}

const lines = readline.createInterface({ input: Readable.from(text(source)), crlfDelay: Infinity });
let read = 0;
for await (const line of lines) {
  if (read++ === 0) continue; // the header
  const [id, fen, movesText, ratingText, deviation, popularity, plays, themesText] = line.split(",");
  const rating = Number(ratingText);
  const moves = movesText.split(" ");
  if (Number(deviation) > 80 || Number(popularity) < 85 || Number(plays) < 1000) continue;
  if (moves.length < 2 || moves.length > 10) continue;
  const themes = themesText.split(" ");
  const types = Chess.puzzleTypesOf(themes);
  const bucket = buckets.get(Math.floor(rating / STEP) * STEP);
  const level = levelOf(rating);
  const spread = bucket && bucket.got.length < bucket.want;
  const kind = !spread && level ? types.map((type) => typed.get(`${type}:${level}`)).find((got) => got.length < PER_TYPE) : undefined;
  if (!spread && !kind) continue;
  if (!valid(fen, moves)) continue;
  const mateTheme = themes.find((theme) => /^mateIn\d$/.test(theme));
  const mateIn = mateTheme ? Number(mateTheme.slice(6)) : themes.includes("mate") ? Math.floor(moves.length / 2) : "";
  const row = [id, fen, movesText, rating, mateIn, types.join(" ")].join(",");
  if (spread) bucket.got.push(row);
  else kind.push(row);
  if (!open()) break;
}
lines.close();

const ratingOf = (row) => Number(row.split(",")[3]);
const picked = [...buckets.entries()].sort(([a], [b]) => a - b).flatMap(([, bucket]) => bucket.got)
  .concat([...typed.values()].flat().sort((a, b) => ratingOf(a) - ratingOf(b)));
const header = `// Generated by scripts/build-puzzle-set.mjs from the Lichess puzzle database
// (CC0, https://database.lichess.org/#puzzles) — do not edit by hand.
// ${picked.length} puzzles, one per line: id,fen,moves (UCI, the setup move first),rating,mateIn,types.
`;
fs.writeFileSync(out, `${header}export const PUZZLE_DATA = \`\n${picked.join("\n")}\n\`;\n`);
const counts = Object.keys(RANGES).map((level) => `${level} ${picked.filter((row) => levelOf(ratingOf(row)) === level).length}`);
const kinds = Chess.PUZZLE_TYPES.map((type) => `${type} ${picked.filter((row) => row.split(",")[5].split(" ").includes(type)).length}`);
console.log(`Read ${read} lines; wrote ${picked.length} puzzles to ${out}\n${counts.join(", ")}\n${kinds.join(", ")}`);
