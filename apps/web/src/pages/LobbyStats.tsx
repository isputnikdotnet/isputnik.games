import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartColumn, Flame, Gamepad2, Trophy } from "lucide-react";
import { GAMES, type AiLevel } from "@isputnik/games-engine";
import type { ArcadeRow, ChessRatingRow, ComputerRow, FamilyStats, PuzzleRow, StatsRow } from "../api";
import { Avatar } from "../shared/Avatar";
import { Button } from "../shared/Button";
import { CATALOG } from "../games/catalog";

// The lobby's two panels on the family's results (the server's /stats): who
// has won most, this month or for all time, in one game or all of them; and
// the member's own month. The leaderboard has four boards: Each other, the
// online games between members; vs Computer, the games each member finished
// against the computer, scored by the level beaten; Chess rating, each
// member's chess rating; Puzzles, the members' chess puzzle ratings; and
// Arcade, each member's best run at Sputnik Catch (Game A or B) or Torpedo
// Run. Each footnote says what its board counts.

type Period = "month" | "all";
type Board = "each" | "computer" | "rating" | "puzzles" | "arcade";
/** The arcade board's choices: a game for one player and the variant it keeps scores by. */
const ARCADE_BOARDS = [
  { game: "sputnik", variant: "A", label: "lobby.board.arcadeSputnikA" },
  { game: "sputnik", variant: "B", label: "lobby.board.arcadeSputnikB" },
  { game: "torpedo", variant: "standard", label: "lobby.board.arcadeTorpedo" }
] as const;
type ArcadeBoard = (typeof ARCADE_BOARDS)[number];

interface Standing {
  id: string;
  name: string;
  played: number;
  won: number;
}

/** The rows of one period, one game (or every game summed), best first. */
export function standings(rows: StatsRow[], game: string | null): Standing[] {
  const byMember = new Map<string, Standing>();
  for (const row of rows) {
    if (game !== null && row.game !== game) continue;
    const entry = byMember.get(row.id) ?? { id: row.id, name: row.name, played: 0, won: 0 };
    entry.played += row.played;
    entry.won += row.won;
    byMember.set(row.id, entry);
  }
  // Most wins first; between equal wins, the one who needed fewer games.
  return [...byMember.values()].sort((a, b) => b.won - a.won || a.played - b.played || a.name.localeCompare(b.name));
}

interface ComputerStanding extends Standing {
  score: number;
  /** The hardest level beaten, and in which game. */
  best: { level: AiLevel; game: string } | null;
}

const LEVEL_RANK: Record<AiLevel, number> = { easy: 1, normal: 2, hard: 3 };

/** The vs Computer board: points first, then wins, then fewer games. */
export function computerStandings(rows: ComputerRow[], game: string | null): ComputerStanding[] {
  const byMember = new Map<string, ComputerStanding>();
  for (const row of rows) {
    if (game !== null && row.game !== game) continue;
    const entry = byMember.get(row.id) ?? { id: row.id, name: row.name, played: 0, won: 0, score: 0, best: null };
    entry.played += row.played;
    entry.won += row.won;
    entry.score += row.score;
    if (row.best && (!entry.best || LEVEL_RANK[row.best] > LEVEL_RANK[entry.best.level])) entry.best = { level: row.best, game: row.game };
    byMember.set(row.id, entry);
  }
  return [...byMember.values()].sort((a, b) =>
    b.score - a.score || b.won - a.won || a.played - b.played || a.name.localeCompare(b.name));
}

/** The Puzzles board: all time by rating; this month by puzzles solved, then rating. */
export function puzzleStandings(rows: PuzzleRow[], period: Period): PuzzleRow[] {
  if (period === "month") {
    return rows.filter((row) => row.solvedSince > 0)
      .sort((a, b) => b.solvedSince - a.solvedSince || b.rating - a.rating || a.name.localeCompare(b.name));
  }
  return [...rows].sort((a, b) => b.rating - a.rating || b.solved - a.solved || a.name.localeCompare(b.name));
}

/** The Chess rating board: highest first, a settled rating before a provisional one of the same. */
export function ratingStandings(rows: ChessRatingRow[]): ChessRatingRow[] {
  return [...rows].sort((a, b) => b.rating - a.rating || Number(a.provisional) - Number(b.provisional) || b.games - a.games || a.name.localeCompare(b.name));
}

/** An arcade board: the highest best first; between equals, fewer runs. */
export function arcadeStandings(rows: ArcadeRow[], game: string, variant: string): ArcadeRow[] {
  return rows.filter((row) => row.game === game && row.variant === variant)
    .sort((a, b) => b.best - a.best || a.played - b.played || a.name.localeCompare(b.name));
}

const gamesOffered = () => GAMES.filter((game) => CATALOG[game.id]);

const TAB_LABEL = {
  each: "lobby.board.tabEach",
  computer: "lobby.board.tabComputer",
  rating: "lobby.board.tabRating",
  puzzles: "lobby.board.tabPuzzles",
  arcade: "lobby.board.tabArcade"
} as const;

const NOTE = {
  each: "lobby.board.note",
  computer: "lobby.board.computerNote",
  rating: "lobby.board.ratingNote",
  puzzles: "lobby.board.puzzlesNote",
  arcade: "lobby.board.arcadeNote"
} as const;

export function Leaderboard({ stats, myId }: { stats: FamilyStats | null; myId: string }) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Board>("each");
  const [period, setPeriod] = useState<Period>("month");
  const [game, setGame] = useState<string | null>(null);
  const [arcadeBoard, setArcadeBoard] = useState<ArcadeBoard>(ARCADE_BOARDS[0]);
  const each = stats && board === "each" ? standings(stats[period], game) : [];
  const computer = stats && board === "computer" ? computerStandings(stats.computer[period], game) : [];
  const puzzles = stats && board === "puzzles" ? puzzleStandings(stats.puzzles ?? [], period) : [];
  const ratings = stats && board === "rating" ? ratingStandings(stats.chessRatings ?? []) : [];
  const arcade = stats && board === "arcade" ? arcadeStandings(stats.arcade?.[period] ?? [], arcadeBoard.game, arcadeBoard.variant) : [];
  const shown = { each: each.length, computer: computer.length, rating: ratings.length, puzzles: puzzles.length, arcade: arcade.length };
  const empty = stats && shown[board] === 0;
  const player = (id: string, name: string) => (id === myId ? t("lobby.board.you", { name }) : name);
  // The top three wear medals; the rest a plain number.
  const rank = (index: number) => <span className={`board-rank-badge${index < 3 ? ` is-${index + 1}` : ""}`}>{index + 1}</span>;

  return (
    <section className="lobby-panel lobby-board" aria-labelledby="lobby-board-title">
      <div className="lobby-panel-head">
        <h2 id="lobby-board-title" className="lobby-section-title">
          <Trophy size={20} aria-hidden="true" className="lobby-board-trophy" /> {t("lobby.board.title")}
        </h2>
        {/* What the board counts, under its title: it changes with the tab. */}
        <p className="lobby-panel-note muted">{t(NOTE[board])}</p>
      </div>
      <div className="board-tabs" role="tablist" aria-label={t("lobby.board.whose")}>
        {(["each", "computer", "rating", "puzzles", "arcade"] as const).map((which) => (
          <Button
            key={which}
            variant="bare"
            role="tab"
            aria-selected={board === which}
            className={`board-tab${board === which ? " is-on" : ""}`}
            onClick={() => setBoard(which)}
          >
            {t(TAB_LABEL[which])}
          </Button>
        ))}
      </div>
      {board !== "rating" && (
      <div className="chip-row" role="group" aria-label={t("lobby.board.period")}>
        <Button variant="chip" selected={period === "month"} onClick={() => setPeriod("month")}>{t("lobby.board.month")}</Button>
        <Button variant="chip" selected={period === "all"} onClick={() => setPeriod("all")}>{t("lobby.board.all")}</Button>
      </div>
      )}
      {(board === "each" || board === "computer") && (
      <div className="chip-row lobby-board-games" role="group" aria-label={t("lobby.board.game")}>
        <Button variant="chip" selected={game === null} onClick={() => setGame(null)}>{t("lobby.board.allGames")}</Button>
        {gamesOffered().map((entry) => (
          <Button key={entry.id} variant="chip" selected={game === entry.id} onClick={() => setGame(entry.id)}>
            {t(CATALOG[entry.id].name)}
          </Button>
        ))}
      </div>
      )}
      {board === "arcade" && (
      <div className="chip-row lobby-board-games" role="group" aria-label={t("lobby.board.variant")}>
        {ARCADE_BOARDS.map((choice) => (
          <Button key={choice.label} variant="chip" selected={arcadeBoard === choice} onClick={() => setArcadeBoard(choice)}>{t(choice.label)}</Button>
        ))}
      </div>
      )}
      {empty && (
        <p className="muted">
          {board === "each"
            ? (period === "month" ? t("lobby.board.emptyMonth") : t("lobby.board.empty"))
            : board === "computer"
              ? (period === "month" ? t("lobby.board.computerEmptyMonth") : t("lobby.board.computerEmpty"))
              : board === "rating"
                ? t("lobby.board.ratingEmpty")
                : board === "arcade"
                  ? (period === "month" ? t("lobby.board.arcadeEmptyMonth") : t("lobby.board.arcadeEmpty"))
                  : (period === "month" ? t("lobby.board.puzzlesEmptyMonth") : t("lobby.board.puzzlesEmpty"))}
        </p>
      )}
      {each.length > 0 && (
        <table className="board-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("lobby.board.player")}</th>
              <th scope="col" className="is-number">{t("lobby.board.won")}</th>
              <th scope="col" className="is-number">{t("lobby.board.played")}</th>
            </tr>
          </thead>
          <tbody>
            {each.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{rank(index)}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span>{player(row.id, row.name)}</span>
                  </span>
                </td>
                <td className="is-number"><span className="board-num">{row.won}</span></td>
                <td className="is-number muted">{row.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {computer.length > 0 && (
        <table className="board-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("lobby.board.player")}</th>
              <th scope="col" className="is-number">{t("lobby.board.score")}</th>
              <th scope="col" className="is-number">{t("lobby.board.won")}</th>
            </tr>
          </thead>
          <tbody>
            {computer.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{rank(index)}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span className="board-player-text">
                      <span>{player(row.id, row.name)}</span>
                      {row.best && CATALOG[row.best.game] && (
                        <span className="board-player-best muted">
                          {t("lobby.board.best", { level: t(`lobby.board.levels.${row.best.level}`), game: t(CATALOG[row.best.game].name) })}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="is-number"><span className="board-num">{row.score}</span></td>
                <td className="is-number muted">{t("lobby.board.wonOf", { won: row.won, played: row.played })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ratings.length > 0 && (
        <table className="board-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("lobby.board.player")}</th>
              <th scope="col" className="is-number">{t("lobby.board.rating")}</th>
              <th scope="col" className="is-number">{t("lobby.board.games")}</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{rank(index)}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span className="board-player-text">
                      <span>{player(row.id, row.name)}</span>
                      {row.provisional && <span className="board-player-best muted">{t("lobby.board.provisional")}</span>}
                    </span>
                  </span>
                </td>
                <td className="is-number"><span className="board-num">{row.rating}</span></td>
                <td className="is-number muted">{row.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {puzzles.length > 0 && (
        <table className="board-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("lobby.board.player")}</th>
              <th scope="col" className="is-number">{t("lobby.board.rating")}</th>
              <th scope="col" className="is-number">{t("lobby.board.solved")}</th>
            </tr>
          </thead>
          <tbody>
            {puzzles.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{rank(index)}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span>{player(row.id, row.name)}</span>
                  </span>
                </td>
                <td className="is-number"><span className="board-num">{row.rating}</span></td>
                <td className="is-number muted">{period === "month" ? row.solvedSince : row.solved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {arcade.length > 0 && (
        <table className="board-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("lobby.board.player")}</th>
              <th scope="col" className="is-number">{t("lobby.board.bestScore")}</th>
              <th scope="col" className="is-number">{t("lobby.board.runs")}</th>
            </tr>
          </thead>
          <tbody>
            {arcade.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{rank(index)}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span>{player(row.id, row.name)}</span>
                  </span>
                </td>
                <td className="is-number"><span className="board-num">{row.best}</span></td>
                <td className="is-number muted">{row.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function YourMonth({ stats, myId, myName }: { stats: FamilyStats | null; myId: string; myName: string }) {
  const { t, i18n } = useTranslation();
  const mine = stats ? stats.month.filter((row) => row.id === myId) : [];
  const played = mine.reduce((sum, row) => sum + row.played, 0);
  const won = mine.reduce((sum, row) => sum + row.won, 0);
  const monthName = new Date().toLocaleDateString(i18n.language, { month: "long" });
  const month = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const byGame = gamesOffered()
    .map((entry) => ({ id: entry.id, row: mine.find((row) => row.game === entry.id) }))
    .filter((entry) => entry.row && entry.row.played > 0);

  return (
    <section className="lobby-panel lobby-month" aria-labelledby="lobby-month-title">
      <div className="lobby-month-head">
        <ChartColumn size={22} aria-hidden="true" className="lobby-month-icon" />
        <div>
          <h2 id="lobby-month-title" className="lobby-section-title">{t("lobby.month.title")}</h2>
          <span className="muted lobby-month-when">{t("lobby.month.when", { month })}</span>
        </div>
      </div>
      {/* Whose month it is, and — before the first game — what it is waiting for. */}
      <div className="month-me">
        <Avatar id={myId} name={myName || "?"} size={48} />
        <div className="month-me-text">
          <strong>{myName}</strong>
          {stats && played === 0 && <span className="muted">{t("lobby.month.empty")}</span>}
        </div>
      </div>
      {stats && (
        <>
          <dl className="month-stats">
            <div>
              <dt><Gamepad2 size={16} aria-hidden="true" className="is-played" /> {t("lobby.month.played")}</dt>
              <dd>{played}</dd>
            </div>
            <div>
              <dt><Trophy size={16} aria-hidden="true" className="is-won" /> {t("lobby.month.won")}</dt>
              <dd>{won}</dd>
              {played > 0 && <span className="muted month-stat-rate">{Math.round((won / played) * 100)}%</span>}
              {/* The win rate as a bar: empty until there is a game to measure. */}
              <span className="month-stat-bar" aria-hidden="true">
                <span style={{ width: `${played > 0 ? Math.round((won / played) * 100) : 0}%` }} />
              </span>
            </div>
            <div>
              <dt><Flame size={16} aria-hidden="true" className="is-streak" /> {t("lobby.month.streak")}</dt>
              <dd>{stats.streak}</dd>
              <span className="muted month-stat-note">{t("lobby.month.streakWins", { count: stats.streak })}</span>
            </div>
          </dl>
          {byGame.length > 0 && (
            <div className="month-games">
              <span className="month-games-title muted">{t("lobby.month.byGame")}</span>
              {byGame.map(({ id, row }) => (
                <div key={id} className="month-game">
                  <span className="month-game-name">{t(CATALOG[id].name)}</span>
                  <span className="month-game-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round((row!.won / row!.played) * 100)}%` }} />
                  </span>
                  <span className="month-game-count muted">{t("lobby.month.wonOf", { won: row!.won, played: row!.played })}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
