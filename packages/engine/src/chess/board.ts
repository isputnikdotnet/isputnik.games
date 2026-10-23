// The chess position as the rules and the computer opponent work on it: a
// mutable board of small numbers with make/unmake, so a search can walk a
// hundred thousand positions without building a state object for each. The
// game's JSON state (rules.ts) is converted to and from this at the edges.
//
// Squares are 0..63, a1 = 0, b1 = 1 … h8 = 63 (rank * 8 + file). A piece is
// its type (1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king), positive for
// White and negative for Black; 0 is an empty square. Colour 0 is White.

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export type Colour = 0 | 1;

/** A move packed into one number: from | to << 6 | promotion << 12 | flag << 15. */
export type Move = number;

export const FLAG_DOUBLE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 3;

export const moveFrom = (move: Move) => move & 63;
export const moveTo = (move: Move) => (move >> 6) & 63;
export const movePromotion = (move: Move) => (move >> 12) & 7;
export const moveFlag = (move: Move) => (move >> 15) & 3;

function pack(from: number, to: number, promotion = 0, flag = 0): Move {
  return from | (to << 6) | (promotion << 12) | (flag << 15);
}

const fileOf = (sq: number) => sq & 7;
const rankOf = (sq: number) => sq >> 3;

export function squareName(sq: number): string {
  return "abcdefgh"[fileOf(sq)] + (rankOf(sq) + 1);
}

export function squareIndex(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
}

// ── Tables ─────────────────────────────────────────────────────────────────

function targets(steps: [number, number][]): number[][] {
  const out: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const list: number[] = [];
    for (const [df, dr] of steps) {
      const f = fileOf(sq) + df;
      const r = rankOf(sq) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) list.push(r * 8 + f);
    }
    out.push(list);
  }
  return out;
}

const KNIGHT_TARGETS = targets([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
const KING_TARGETS = targets([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
/** The squares a pawn of each colour attacks from each square. */
const PAWN_ATTACKS = [targets([[-1, 1], [1, 1]]), targets([[-1, -1], [1, -1]])];

/** Rays out of every square: the first four straight (rook), the last four diagonal (bishop). */
const DIRECTIONS: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const RAYS: number[][][] = DIRECTIONS.map(([df, dr]) => {
  const perSquare: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const ray: number[] = [];
    let f = fileOf(sq) + df;
    let r = rankOf(sq) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      ray.push(r * 8 + f);
      f += df;
      r += dr;
    }
    perSquare.push(ray);
  }
  return perSquare;
});

/** Castling rights: 1 White short, 2 White long, 4 Black short, 8 Black long. */
const CASTLE_KEEP = new Array<number>(64).fill(15);
CASTLE_KEEP[0] = 15 & ~2;
CASTLE_KEEP[7] = 15 & ~1;
CASTLE_KEEP[4] = 15 & ~3;
CASTLE_KEEP[56] = 15 & ~8;
CASTLE_KEEP[63] = 15 & ~4;
CASTLE_KEEP[60] = 15 & ~12;

const LETTERS = ".pnbrqk";

interface Undo {
  move: Move;
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
}

export class Position {
  board = new Int8Array(64);
  turn: Colour = 0;
  castling = 0;
  /** The square a pawn may capture onto en passant, or -1. */
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings: [number, number] = [4, 60];
  private undos: Undo[] = [];

  static fromFen(fen: string): Position {
    const [placement, turn, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
    const ranks = placement?.split("/") ?? [];
    if (ranks.length !== 8) throw new Error("A FEN board has eight ranks");
    const position = new Position();
    ranks.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const type = LETTERS.indexOf(ch.toLowerCase());
        if (type <= 0 || file > 7) throw new Error(`Unknown piece "${ch}"`);
        position.board[rank * 8 + file] = ch === ch.toLowerCase() ? -type : type;
        file++;
      }
      if (file !== 8) throw new Error(`Rank ${rank + 1} is not eight squares`);
    });
    position.turn = turn === "b" ? 1 : 0;
    position.castling = 0;
    for (const ch of castling ?? "-") {
      if (ch === "K") position.castling |= 1;
      else if (ch === "Q") position.castling |= 2;
      else if (ch === "k") position.castling |= 4;
      else if (ch === "q") position.castling |= 8;
    }
    position.ep = ep && ep !== "-" ? squareIndex(ep) : -1;
    position.halfmove = Number(halfmove ?? 0) || 0;
    position.fullmove = Number(fullmove ?? 1) || 1;
    position.findKings();
    return position;
  }

  findKings(): void {
    for (let sq = 0; sq < 64; sq++) {
      if (this.board[sq] === KING) this.kings[0] = sq;
      else if (this.board[sq] === -KING) this.kings[1] = sq;
    }
  }

  /** The 64 squares a1…h8 as letters: PNBRQK White, pnbrqk Black, "." empty. */
  boardString(): string {
    let out = "";
    for (let sq = 0; sq < 64; sq++) out += letterOf(this.board[sq]);
    return out;
  }

  static fromBoardString(board: string): Position {
    if (board.length !== 64) throw new Error("A board is 64 squares");
    const position = new Position();
    for (let sq = 0; sq < 64; sq++) {
      const ch = board[sq];
      if (ch === ".") continue;
      const type = LETTERS.indexOf(ch.toLowerCase());
      if (type <= 0) throw new Error(`Unknown piece "${ch}"`);
      position.board[sq] = ch === ch.toLowerCase() ? -type : type;
    }
    position.findKings();
    return position;
  }

  castlingString(): string {
    let out = "";
    if (this.castling & 1) out += "K";
    if (this.castling & 2) out += "Q";
    if (this.castling & 4) out += "k";
    if (this.castling & 8) out += "q";
    return out || "-";
  }

  fen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 8 + file];
        if (piece === 0) {
          empty++;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        row += letterOf(piece);
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const ep = this.ep >= 0 ? squareName(this.ep) : "-";
    return `${rows.join("/")} ${this.turn === 0 ? "w" : "b"} ${this.castlingString()} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  /**
   * What makes two positions "the same" for repetition: the pieces, the side
   * to move, the castling rights, and an en passant square only when a pawn
   * could actually take there (otherwise it changes nothing a player can do).
   */
  repetitionKey(): string {
    let ep = "-";
    if (this.ep >= 0) {
      const ours = this.turn === 0 ? PAWN : -PAWN;
      if (PAWN_ATTACKS[this.turn ^ 1][this.ep].some((sq) => this.board[sq] === ours)) ep = squareName(this.ep);
    }
    return `${this.boardString()} ${this.turn} ${this.castlingString()} ${ep}`;
  }

  /** Whether `sq` is attacked by colour `by`. */
  attacked(sq: number, by: Colour): boolean {
    const sign = by === 0 ? 1 : -1;
    const board = this.board;
    for (const from of PAWN_ATTACKS[by ^ 1][sq]) if (board[from] === sign * PAWN) return true;
    for (const from of KNIGHT_TARGETS[sq]) if (board[from] === sign * KNIGHT) return true;
    for (const from of KING_TARGETS[sq]) if (board[from] === sign * KING) return true;
    for (let d = 0; d < 8; d++) {
      const ray = RAYS[d][sq];
      for (let i = 0; i < ray.length; i++) {
        const piece = board[ray[i]];
        if (piece === 0) continue;
        if (piece * sign > 0) {
          const type = piece * sign;
          if (type === QUEEN || type === (d < 4 ? ROOK : BISHOP)) return true;
        }
        break;
      }
    }
    return false;
  }

  inCheck(colour: Colour = this.turn): boolean {
    return this.attacked(this.kings[colour], (colour ^ 1) as Colour);
  }

  /** Every move by the side to move that obeys the pieces, without asking
   *  whether it leaves the king in check (legalMoves does). */
  pseudoMoves(capturesOnly = false): Move[] {
    const moves: Move[] = [];
    const board = this.board;
    const us = this.turn;
    const sign = us === 0 ? 1 : -1;
    const lastRank = us === 0 ? 7 : 0;
    const startRank = us === 0 ? 1 : 6;

    const addPawn = (from: number, to: number, flag = 0) => {
      if (rankOf(to) === lastRank) {
        moves.push(pack(from, to, QUEEN), pack(from, to, KNIGHT), pack(from, to, ROOK), pack(from, to, BISHOP));
      } else {
        moves.push(pack(from, to, 0, flag));
      }
    };

    for (let from = 0; from < 64; from++) {
      const piece = board[from] * sign;
      if (piece <= 0) continue;
      if (piece === PAWN) {
        const one = from + 8 * sign;
        if (board[one] === 0 && (!capturesOnly || rankOf(one) === lastRank)) {
          addPawn(from, one);
          const two = one + 8 * sign;
          if (!capturesOnly && rankOf(from) === startRank && board[two] === 0) moves.push(pack(from, two, 0, FLAG_DOUBLE));
        }
        for (const to of PAWN_ATTACKS[us][from]) {
          if (board[to] * sign < 0) addPawn(from, to);
          else if (to === this.ep) moves.push(pack(from, to, 0, FLAG_EN_PASSANT));
        }
      } else if (piece === KNIGHT || piece === KING) {
        for (const to of (piece === KNIGHT ? KNIGHT_TARGETS : KING_TARGETS)[from]) {
          const target = board[to] * sign;
          if (target > 0 || (capturesOnly && target === 0)) continue;
          moves.push(pack(from, to));
        }
      } else {
        const first = piece === BISHOP ? 4 : 0;
        const last = piece === ROOK ? 4 : 8;
        for (let d = first; d < last; d++) {
          const ray = RAYS[d][from];
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i];
            const target = board[to] * sign;
            if (target > 0) break;
            if (target < 0) {
              moves.push(pack(from, to));
              break;
            }
            if (!capturesOnly) moves.push(pack(from, to));
          }
        }
      }
    }

    if (!capturesOnly) this.castlingMoves(moves);
    return moves;
  }

  private castlingMoves(moves: Move[]): void {
    const board = this.board;
    const them = (this.turn ^ 1) as Colour;
    const base = this.turn === 0 ? 0 : 56;
    const short = this.turn === 0 ? 1 : 4;
    const long = this.turn === 0 ? 2 : 8;
    if (!(this.castling & (short | long)) || this.attacked(base + 4, them)) return;
    if (this.castling & short && board[base + 5] === 0 && board[base + 6] === 0
      && !this.attacked(base + 5, them) && !this.attacked(base + 6, them)) {
      moves.push(pack(base + 4, base + 6, 0, FLAG_CASTLE));
    }
    if (this.castling & long && board[base + 3] === 0 && board[base + 2] === 0 && board[base + 1] === 0
      && !this.attacked(base + 3, them) && !this.attacked(base + 2, them)) {
      moves.push(pack(base + 4, base + 2, 0, FLAG_CASTLE));
    }
  }

  /** Plays a move; returns false (and takes it back) when it leaves the mover's
   *  king in check. Every true needs an unmake(). */
  make(move: Move): boolean {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flag = moveFlag(move);
    const promotion = movePromotion(move);
    const piece = board[from];
    const sign = this.turn === 0 ? 1 : -1;
    let captured = board[to];

    this.undos.push({ move, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove });
    if (flag === FLAG_EN_PASSANT) {
      const victim = to - 8 * sign;
      captured = board[victim];
      board[victim] = 0;
    }
    this.undos[this.undos.length - 1].captured = captured;

    board[to] = promotion ? promotion * sign : piece;
    board[from] = 0;
    if (flag === FLAG_CASTLE) {
      const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      board[rookTo] = board[rookFrom];
      board[rookFrom] = 0;
    }
    if (piece * sign === KING) this.kings[this.turn] = to;

    this.castling &= CASTLE_KEEP[from] & CASTLE_KEEP[to];
    this.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = piece * sign === PAWN || captured !== 0 ? 0 : this.halfmove + 1;
    if (this.turn === 1) this.fullmove++;
    this.turn = (this.turn ^ 1) as Colour;

    if (this.inCheck((this.turn ^ 1) as Colour)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake(): void {
    const undo = this.undos.pop();
    if (!undo) return;
    const board = this.board;
    const { move, captured } = undo;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flag = moveFlag(move);
    this.turn = (this.turn ^ 1) as Colour;
    const sign = this.turn === 0 ? 1 : -1;
    if (this.turn === 1) this.fullmove--;

    board[from] = movePromotion(move) ? PAWN * sign : board[to];
    if (flag === FLAG_EN_PASSANT) {
      board[to] = 0;
      board[to - 8 * sign] = captured;
    } else {
      board[to] = captured;
    }
    if (flag === FLAG_CASTLE) {
      const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      board[rookFrom] = board[rookTo];
      board[rookTo] = 0;
    }
    if (board[from] * sign === KING) this.kings[this.turn] = from;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
  }

  /** The piece the last make() took, 0 for none. */
  lastCaptured(): number {
    return this.undos.length ? this.undos[this.undos.length - 1].captured : 0;
  }

  legalMoves(): Move[] {
    const legal: Move[] = [];
    for (const move of this.pseudoMoves()) {
      if (this.make(move)) {
        legal.push(move);
        this.unmake();
      }
    }
    return legal;
  }

  /** No mate is possible with what is left: king against king, a lone minor
   *  piece, or bishops that all stand on one colour of square. */
  insufficientMaterial(): boolean {
    let minors = 0;
    let knights = 0;
    const bishopColours = new Set<number>();
    for (let sq = 0; sq < 64; sq++) {
      const type = Math.abs(this.board[sq]);
      if (type === 0 || type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      minors++;
      if (type === KNIGHT) knights++;
      else bishopColours.add((fileOf(sq) + rankOf(sq)) & 1);
    }
    if (minors <= 1) return true;
    return knights === 0 && bishopColours.size === 1;
  }

  /** Standard algebraic notation for a legal move, check and mate included. */
  san(move: Move): string {
    const from = moveFrom(move);
    const to = moveTo(move);
    const sign = this.turn === 0 ? 1 : -1;
    const type = this.board[from] * sign;
    let out: string;
    if (moveFlag(move) === FLAG_CASTLE) {
      out = to > from ? "O-O" : "O-O-O";
    } else {
      const capture = this.board[to] !== 0 || moveFlag(move) === FLAG_EN_PASSANT;
      if (type === PAWN) {
        out = capture ? `${"abcdefgh"[fileOf(from)]}x${squareName(to)}` : squareName(to);
        const promotion = movePromotion(move);
        if (promotion) out += `=${LETTERS[promotion].toUpperCase()}`;
      } else {
        // Name the square it came from only as far as needed to tell it from
        // another piece of the same kind that could go there too.
        const rivals = this.legalMoves().filter((other) => moveTo(other) === to && moveFrom(other) !== from
          && this.board[moveFrom(other)] === this.board[from]);
        let which = "";
        if (rivals.length) {
          if (!rivals.some((other) => fileOf(moveFrom(other)) === fileOf(from))) which = "abcdefgh"[fileOf(from)];
          else if (!rivals.some((other) => rankOf(moveFrom(other)) === rankOf(from))) which = String(rankOf(from) + 1);
          else which = squareName(from);
        }
        out = `${LETTERS[type].toUpperCase()}${which}${capture ? "x" : ""}${squareName(to)}`;
      }
    }
    if (this.make(move)) {
      if (this.inCheck()) out += this.legalMoves().length === 0 ? "#" : "+";
      this.unmake();
    }
    return out;
  }
}

function letterOf(piece: number): string {
  if (piece === 0) return ".";
  const letter = LETTERS[Math.abs(piece)];
  return piece > 0 ? letter.toUpperCase() : letter;
}

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Counts the leaf positions `depth` moves deep — the standard check of a move
 *  generator against published numbers. */
export function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of position.pseudoMoves()) {
    if (!position.make(move)) continue;
    nodes += depth === 1 ? 1 : perft(position, depth - 1);
    position.unmake();
  }
  return nodes;
}
