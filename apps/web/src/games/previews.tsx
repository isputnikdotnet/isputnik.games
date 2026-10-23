import { PieceGlyph } from "./chess/pieces";

// A small picture of each game for its lobby card: a corner of a game under
// way, drawn as the game itself draws it. Dots follows the theme; Star Battle
// keeps its space and Chess its wooden board on every theme, as their pages do.
export function GamePreview({ game }: { game: string }) {
  if (game === "dots") return <DotsPreview />;
  if (game === "starbattle") return <StarBattlePreview />;
  if (game === "chess") return <ChessPreview />;
  return null;
}

const VIEW = "0 0 200 112";

function DotsPreview() {
  const lines = [16, 36, 56, 76, 96, 116, 136, 156, 176, 196];
  const ring = [[76, 36], [96, 16], [116, 36], [116, 56], [96, 76], [76, 56]];
  return (
    <svg className="game-preview is-dots" viewBox={VIEW} aria-hidden="true" focusable="false">
      <rect className="game-preview-ground" width="200" height="112" />
      <g className="game-preview-grid">
        {lines.map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={112} />)}
        {[16, 36, 56, 76, 96].map((y) => <line key={`h${y}`} x1={0} y1={y} x2={200} y2={y} />)}
      </g>
      <polygon className="game-preview-ring" points={ring.map((p) => p.join(",")).join(" ")} />
      <g className="game-preview-red">
        {[...ring, [156, 76], [36, 96]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="5" />)}
      </g>
      <g className="game-preview-blue">
        <circle cx="96" cy="36" r="5" opacity="0.45" />
        <circle cx="96" cy="56" r="5" opacity="0.45" />
        {[[56, 76], [136, 36], [156, 56], [36, 36], [176, 96]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="5" />)}
      </g>
    </svg>
  );
}

function StarBattlePreview() {
  const stars = [[14, 18, 1], [52, 9, 0.8], [91, 30, 1.2], [133, 12, 0.8], [176, 26, 1], [22, 74, 0.9], [70, 100, 1.1], [118, 84, 0.8], [160, 102, 1], [188, 66, 0.8]];
  return (
    <svg className="game-preview is-starbattle" viewBox={VIEW} aria-hidden="true" focusable="false">
      <rect width="200" height="112" fill="#0a1422" />
      <g fill="#ffffff">{stars.map(([x, y, r]) => <circle key={`${x},${y}`} cx={x} cy={y} r={r} />)}</g>
      <path d="M40 0V112M80 0V112M120 0V112M160 0V112M0 37H200M0 75H200" stroke="#6fa3c8" strokeOpacity="0.22" />
      <rect x="44" y="44" width="72" height="24" rx="12" fill="#2b4a63" stroke="#8ec5e8" strokeWidth="1.5" />
      <circle cx="104" cy="56" r="6" fill="#8ec5e8" />
      <rect x="128" y="81" width="24" height="24" rx="12" fill="#2b4a63" stroke="#8ec5e8" strokeWidth="1.5" />
      <g transform="translate(60 56)">
        <circle r="12" fill="#f2a33a" opacity="0.35" />
        <path d="M0-10 3-3 10 0 3 3 0 10-3 3-10 0-3-3z" fill="#f5c45e" />
      </g>
      <circle cx="160" cy="18" r="4" fill="none" stroke="#6fa3c8" strokeWidth="1.5" />
      <circle cx="20" cy="94" r="4" fill="none" stroke="#6fa3c8" strokeWidth="1.5" />
    </svg>
  );
}

const SQUARE = 25;
// White's half of a game a few moves in, ranks 1 to 5 (the fifth cut by the edge).
const PIECES: [string, string][] = [
  ["a1", "R"], ["c1", "B"], ["d1", "Q"], ["f1", "R"], ["g1", "K"],
  ["a2", "P"], ["b2", "P"], ["c2", "P"], ["f2", "P"], ["g2", "P"], ["h2", "P"],
  ["c3", "N"], ["f3", "N"],
  ["b4", "b"], ["d4", "P"], ["e4", "P"],
  ["d5", "p"], ["f5", "p"]
];

const xOf = (square: string) => (square.charCodeAt(0) - 97) * SQUARE;
const yOf = (square: string) => 112 - Number(square[1]) * SQUARE;

function ChessPreview() {
  const squares: { x: number; y: number; dark: boolean }[] = [];
  for (let rank = 1; rank <= 5; rank++) {
    for (let file = 0; file < 8; file++) {
      squares.push({ x: file * SQUARE, y: 112 - rank * SQUARE, dark: (file + rank) % 2 === 1 });
    }
  }
  return (
    <svg className="game-preview is-chess" viewBox={VIEW} aria-hidden="true" focusable="false">
      {squares.map(({ x, y, dark }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={SQUARE} height={SQUARE} className={dark ? "game-preview-dark" : "game-preview-light"} />
      ))}
      {["e2", "e4"].map((square) => (
        <rect key={square} x={xOf(square)} y={yOf(square)} width={SQUARE} height={SQUARE} className="game-preview-last" />
      ))}
      {PIECES.map(([square, letter]) => <PieceGlyph key={square} letter={letter} x={xOf(square)} y={yOf(square)} size={SQUARE} />)}
    </svg>
  );
}
