import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Crossmath, type CrossmathOp, type CrossmathPlay, type CrossmathPuzzle } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";

// The printed grid: numbers on the even tracks, operators and "=" between,
// the totals at the row ends and under the columns. Only the number squares
// are controls — a grid of buttons with one tab stop (the focused square) that
// the arrow keys walk; each square is described by its row's and its column's
// equations, spelled out for a screen reader.

export const SYMBOL: Record<CrossmathOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const SPOKEN = { "+": "crossmath.ops.plus", "-": "crossmath.ops.minus", "*": "crossmath.ops.times", "/": "crossmath.ops.divided" } as const;

export interface BoardMarks {
  /** Lines Check found wrong / right, as "row0", "col2". */
  bad?: Set<string>;
  good?: Set<string>;
  /** A tile Hint says is out of place. */
  flag?: number;
}

export function CrossmathBoard({
  puzzle,
  play,
  solved,
  target,
  focus,
  marks,
  dropped,
  onCell,
  onKey
}: {
  puzzle: CrossmathPuzzle;
  play: CrossmathPlay;
  solved: boolean;
  /** The empty square a tile from the bank goes to. */
  target: number | null;
  focus: number;
  marks: BoardMarks;
  /** The square a tile just landed on, for its little settle. */
  dropped: number | null;
  onCell: (cell: number) => void;
  onKey: (event: KeyboardEvent<HTMLButtonElement>, cell: number, focusCell: (cell: number) => void) => void;
}) {
  const { t } = useTranslation();
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const { n } = puzzle;
  const lines = Crossmath.linesOf(puzzle);
  const grid = Crossmath.gridValues(puzzle, play);
  const focusRow = Math.floor(focus / n);
  const focusCol = focus % n;
  const tracks = `repeat(${n}, minmax(0, 1fr) minmax(0, .55fr)) minmax(0, 1fr)`;
  const focusCell = (cell: number) => refs.current.get(cell)?.focus();
  const place = (row: number, col: number) => ({ gridRow: row + 1, gridColumn: col + 1 });

  const spoken = (line: (typeof lines)[number]) => {
    const words = line.cells
      .map((cell, i) => `${i ? `${t(SPOKEN[line.ops[i - 1]])} ` : ""}${grid[cell] ?? t("crossmath.blank")}`)
      .join(" ");
    const name = t(line.kind === "row" ? "crossmath.row" : "crossmath.col", { number: line.index + 1 });
    return t("crossmath.equation", { line: name, words, total: line.total });
  };
  const totalClass = (key: string) => (marks.bad?.has(key) ? " is-bad" : marks.good?.has(key) ? " is-good" : "");
  const idOf = (key: string) => `crossmath-${puzzle.id}-${key}`;

  const rows = [];
  for (let r = 0; r < n; r++) {
    const items = [];
    for (let c = 0; c < n; c++) {
      const cell = r * n + c;
      const given = Crossmath.isGiven(puzzle, cell);
      const tile = play.cells[cell];
      const value = grid[cell];
      const hinted = play.hinted.includes(cell);
      const label = given
        ? t("crossmath.cell.given", { row: r + 1, col: c + 1, value })
        : tile != null
          ? t(hinted ? "crossmath.cell.hinted" : "crossmath.cell.tile", { row: r + 1, col: c + 1, value })
          : t("crossmath.cell.empty", { row: r + 1, col: c + 1 });
      const classes = [
        "crossmath-cell",
        given ? "is-given" : tile != null ? "is-placed" : "is-empty",
        !solved && (r === focusRow || c === focusCol) && "is-line",
        !solved && target === cell && "is-target",
        marks.flag === cell && "is-flagged",
        hinted && "is-hinted"
      ].filter(Boolean).join(" ");
      items.push(
        <div key={`n${c}`} role="gridcell" className="crossmath-slot" style={place(2 * r, 2 * c)}>
          <Button
            variant="bare"
            className={classes}
            ref={(element) => {
              if (element) refs.current.set(cell, element);
              else refs.current.delete(cell);
            }}
            tabIndex={cell === focus ? 0 : -1}
            aria-label={label}
            aria-describedby={`${idOf(`row${r}`)} ${idOf(`col${c}`)}`}
            aria-disabled={given || solved || undefined}
            onClick={() => onCell(cell)}
            onKeyDown={(event) => onKey(event, cell, focusCell)}
          >
            {given ? value : tile != null ? <span className={`crossmath-tile${dropped === cell ? " is-dropped" : ""}`}>{value}</span> : null}
          </Button>
        </div>
      );
      if (c < n - 1) items.push(<span key={`o${c}`} className="crossmath-op" style={place(2 * r, 2 * c + 1)} aria-hidden="true">{SYMBOL[puzzle.rowOps[r][c]]}</span>);
    }
    items.push(<span key="eq" className="crossmath-op" style={place(2 * r, 2 * n - 1)} aria-hidden="true">=</span>);
    items.push(<span key="total" className={`crossmath-total${totalClass(`row${r}`)}`} style={place(2 * r, 2 * n)} aria-hidden="true">{lines[r].total}</span>);
    rows.push(<div key={`r${r}`} role="row" className="crossmath-row">{items}</div>);
    if (r < n - 1) {
      for (let c = 0; c < n; c++) {
        rows.push(<span key={`v${r}-${c}`} className="crossmath-op" style={place(2 * r + 1, 2 * c)} aria-hidden="true">{SYMBOL[puzzle.colOps[r][c]]}</span>);
      }
    }
  }
  for (let c = 0; c < n; c++) {
    rows.push(<span key={`veq${c}`} className="crossmath-op is-down" style={place(2 * n - 1, 2 * c)} aria-hidden="true">=</span>);
    rows.push(<span key={`vt${c}`} className={`crossmath-total${totalClass(`col${c}`)}`} style={place(2 * n, 2 * c)} aria-hidden="true">{lines[n + c].total}</span>);
  }

  return (
    <div className="crossmath-board-frame">
      <div
        className={`crossmath-board${solved ? " is-solved" : ""}`}
        role="grid"
        aria-label={t("crossmath.board")}
        style={{ gridTemplateColumns: tracks, gridTemplateRows: tracks, ["--tracks" as string]: n * 1.55 + 1 }}
      >
        {rows}
      </div>
      <div className="visually-hidden">
        {lines.map((line) => <span key={`${line.kind}${line.index}`} id={idOf(`${line.kind}${line.index}`)}>{spoken(line)}</span>)}
      </div>
    </div>
  );
}
