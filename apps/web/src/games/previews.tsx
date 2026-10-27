import { PieceGlyph } from "./chess/pieces";
import { pipsOf } from "./dominoes/DominoTile";

// A small picture of each game for its lobby card: a corner of a game under
// way, drawn as the game itself draws it. Dots follows the theme; Star Battle
// keeps its space, Chess its wooden board, Dominoes its felt, Sputnik Catch
// its handheld and Torpedo Run its periscope on every theme, as their pages do.
export function GamePreview({ game }: { game: string }) {
  if (game === "dots") return <DotsPreview />;
  if (game === "starbattle") return <StarBattlePreview />;
  if (game === "chess") return <ChessPreview />;
  if (game === "dominoes") return <DominoesPreview />;
  if (game === "sputnik") return <SputnikPreview />;
  if (game === "torpedo") return <TorpedoPreview />;
  return null;
}

/** Torpedo Run: the periscope's lens at dusk, a torpedo's wake closing on a destroyer. */
function TorpedoPreview() {
  const ship = "#071012";
  return (
    <svg className="game-preview is-torpedo" viewBox={VIEW} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="torpedo-preview-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24384a" />
          <stop offset="1" stopColor="#b8703f" />
        </linearGradient>
        <linearGradient id="torpedo-preview-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3a40" />
          <stop offset="1" stopColor="#051316" />
        </linearGradient>
        <clipPath id="torpedo-preview-lens">
          <rect x="12" y="10" width="176" height="92" rx="46" />
        </clipPath>
      </defs>
      <rect width="200" height="112" fill="#0b2422" />
      <g clipPath="url(#torpedo-preview-lens)">
        <rect x="0" y="0" width="200" height="52" fill="url(#torpedo-preview-sky)" />
        <rect x="0" y="52" width="200" height="60" fill="url(#torpedo-preview-sea)" />
        <path d="M118 57 L160 57 L166 52 L164 59 L119 59 Z M130 57 V53 H140 V57 Z M135 53 V46 H136 V53 Z" fill={ship} />
        <path d="M30 70 L76 70 L72 74 L33 74 Z M34 70 V64 H42 V70 Z M36 64 V61 H39 V64 Z" fill={ship} />
        {[[100, 98, 3.4], [104, 88, 3], [108, 79, 2.6], [112, 71, 2.2], [116, 65, 1.8]].map(([x, y, r]) => (
          <circle key={y} cx={x} cy={y} r={r} fill="#ffd27a" opacity={0.5 + r / 8} />
        ))}
        <g stroke="#ffd27a" strokeOpacity="0.55" strokeWidth="1">
          <line x1="100" y1="16" x2="100" y2="46" />
          <line x1="100" y1="58" x2="100" y2="96" />
          <line x1="30" y1="52" x2="94" y2="52" />
          <line x1="106" y1="52" x2="170" y2="52" />
        </g>
      </g>
      <rect x="12" y="10" width="176" height="92" rx="46" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="6" />
    </svg>
  );
}

/** Sputnik Catch: a corner of the handheld's LCD mid-run. */
function SputnikPreview() {
  const ink = "#1b2119";
  const lcd = "#c5cbb2";
  const sputnik = (x: number, y: number, opacity = 1) => (
    <g opacity={opacity}>
      <path d={`M${x - 3},${y - 1} l-8,-5 M${x - 3},${y} l-9,-1 M${x - 3},${y + 1} l-8,3`} stroke={ink} strokeWidth="1.1" strokeLinecap="round" />
      <circle cx={x} cy={y} r="3.4" fill={lcd} stroke={ink} strokeWidth="1.4" />
    </g>
  );
  return (
    <svg className="game-preview is-sputnik" viewBox={VIEW} aria-hidden="true" focusable="false">
      <rect width="200" height="112" fill="#dcd8cd" />
      <rect x="20" y="6" width="160" height="100" rx="8" fill="#123f3c" />
      <rect x="24" y="10" width="152" height="92" rx="5" fill={lcd} />
      <g fill="#5a6976">
        {[[70, 20], [120, 28], [150, 46], [40, 72], [160, 86], [96, 18]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="1" />)}
      </g>
      <g opacity="0.08" fill={ink}>
        <rect x="134" y="16" width="7" height="13" rx="1" />
        <rect x="144" y="16" width="7" height="13" rx="1" />
      </g>
      <text x="153" y="29" fill={ink} fontSize="14" fontFamily="'Arial Black', sans-serif">7</text>
      <rect x="28" y="24" width="28" height="15" rx="3" fill="#b1b79e" stroke="#5a6976" strokeWidth="1.2" />
      <circle cx="35" cy="31.5" r="3.2" fill="#9fb1b6" stroke="#5a6976" strokeWidth="1" />
      <path d="M47 27.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z" fill="#b8322a" />
      <line x1="58" y1="37" x2="96" y2="52" stroke="#6f6c62" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="144" y="60" width="28" height="15" rx="3" fill="#b1b79e" stroke="#5a6976" strokeWidth="1.2" />
      <line x1="142" y1="73" x2="118" y2="83" stroke="#6f6c62" strokeWidth="2.5" strokeLinecap="round" />
      {sputnik(70, 37)}
      {sputnik(88, 44)}
      <g transform="translate(138 70) scale(-1 1)">{sputnik(0, 0, 0.12)}</g>
      <g stroke={ink} strokeWidth="1.4" strokeLinejoin="round">
        <path d="M84 52 Q86 62 92 63 Q98 62 100 52" fill={lcd} />
        <ellipse cx="92" cy="52" rx="8" ry="2.4" fill="none" strokeWidth="1.8" />
        <path d="M108 72 L101 64 L99 54" fill="none" strokeWidth="3" strokeLinecap="round" />
        <path d="M118 46 L120 36" fill="none" />
        <rect x="104" y="46" width="24" height="18" rx="4" fill={lcd} />
        <circle cx="111" cy="54" r="3" fill={lcd} />
        <circle cx="120" cy="54" r="3" fill={lcd} />
        <rect x="106" y="65" width="20" height="21" rx="3" fill={lcd} />
      </g>
      <circle cx="120.5" cy="35" r="2" fill={ink} />
      <circle cx="110" cy="54.5" r="1.4" fill={ink} />
      <circle cx="119" cy="54.5" r="1.4" fill={ink} />
      <path d="M116 70l1 2.2 2.4.2-1.8 1.6.5 2.3-2.1-1.2-2.1 1.2.5-2.3-1.8-1.6 2.4-.2z" fill={ink} />
      <rect x="103" y="87" width="26" height="8" rx="4" fill={ink} />
    </svg>
  );
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

const PIP = 11;
// A stretch of a line on the felt, doubles crosswise, with a tile in hand below.
const LINE: { x: number; y: number; v: boolean; a: number; b: number }[] = [
  { x: 10, y: 38, v: false, a: 6, b: 2 },
  { x: 46, y: 29, v: true, a: 2, b: 2 },
  { x: 64, y: 38, v: false, a: 2, b: 5 },
  { x: 100, y: 38, v: false, a: 5, b: 3 },
  { x: 136, y: 29, v: true, a: 3, b: 3 },
  { x: 154, y: 38, v: false, a: 3, b: 1 },
  { x: 172, y: 56, v: true, a: 1, b: 4 }
];

function PreviewTile({ x, y, v, a, b }: { x: number; y: number; v: boolean; a: number; b: number }) {
  const half = 18;
  const w = v ? half : 2 * half;
  const h = v ? 2 * half : half;
  const pips = (n: number, ox: number, oy: number) =>
    pipsOf(n, v).map(([px, py]) => <circle key={`${ox},${oy},${px},${py}`} cx={x + ox + (px / 100) * half} cy={y + oy + (py / 100) * half} r={PIP / 6} fill="#1d1a16" />);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#f4ecd8" stroke="#cbbd99" />
      <line x1={v ? x + 3 : x + half} y1={v ? y + half : y + 3} x2={v ? x + half - 3 : x + half} y2={v ? y + half : y + half - 3} stroke="#a99b7b" />
      {pips(a, 0, 0)}
      {pips(b, v ? 0 : half, v ? half : 0)}
    </g>
  );
}

function DominoesPreview() {
  return (
    <svg className="game-preview is-dominoes" viewBox={VIEW} aria-hidden="true" focusable="false">
      <rect width="200" height="112" fill="#1f4d3c" />
      {LINE.map((tile) => <PreviewTile key={`${tile.x},${tile.y}`} {...tile} />)}
      <rect x="40" y="86" width="18" height="36" rx="3" fill="#6b2a24" stroke="#4a1c18" />
      <rect x="62" y="86" width="18" height="36" rx="3" fill="#6b2a24" stroke="#4a1c18" />
    </svg>
  );
}
