import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { GAMES, type AiLevel } from "@isputnik/games-engine";
import type { ComputerRow, FamilyStats, StatsRow } from "../api";
import { Avatar } from "../shared/Avatar";
import { Button } from "../shared/Button";
import { CATALOG } from "../games/catalog";

// The lobby's two panels on the family's results (the server's /stats): who
// has won most, this month or for all time, in one game or all of them; and
// the member's own month. The leaderboard has two boards: Each other, the
// online games between members, and vs Computer, the games each member
// finished against the computer, scored by the level beaten. Each footnote
// says what its board counts.

type Period = "month" | "all";
type Board = "each" | "computer";

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

const gamesOffered = () => GAMES.filter((game) => CATALOG[game.id]);

export function Leaderboard({ stats, myId }: { stats: FamilyStats | null; myId: string }) {
  const { t } = useTranslation();
  const [board, setBoard] = useState<Board>("each");
  const [period, setPeriod] = useState<Period>("month");
  const [game, setGame] = useState<string | null>(null);
  const each = stats && board === "each" ? standings(stats[period], game) : [];
  const computer = stats && board === "computer" ? computerStandings(stats.computer[period], game) : [];
  const empty = stats && (board === "each" ? each.length === 0 : computer.length === 0);
  const player = (id: string, name: string) => (id === myId ? t("lobby.board.you", { name }) : name);

  return (
    <section className="lobby-panel lobby-board" aria-labelledby="lobby-board-title">
      <div className="lobby-panel-head">
        <h2 id="lobby-board-title" className="lobby-section-title">
          <Trophy size={18} aria-hidden="true" className="lobby-board-trophy" /> {t("lobby.board.title")}
        </h2>
      </div>
      <div className="board-tabs" role="tablist" aria-label={t("lobby.board.whose")}>
        {(["each", "computer"] as const).map((which) => (
          <Button
            key={which}
            variant="bare"
            role="tab"
            aria-selected={board === which}
            className={`board-tab${board === which ? " is-on" : ""}`}
            onClick={() => setBoard(which)}
          >
            {which === "each" ? t("lobby.board.tabEach") : t("lobby.board.tabComputer")}
          </Button>
        ))}
      </div>
      <div className="chip-row" role="group" aria-label={t("lobby.board.period")}>
        <Button variant="chip" selected={period === "month"} onClick={() => setPeriod("month")}>{t("lobby.board.month")}</Button>
        <Button variant="chip" selected={period === "all"} onClick={() => setPeriod("all")}>{t("lobby.board.all")}</Button>
      </div>
      <div className="chip-row lobby-board-games" role="group" aria-label={t("lobby.board.game")}>
        <Button variant="chip" selected={game === null} onClick={() => setGame(null)}>{t("lobby.board.allGames")}</Button>
        {gamesOffered().map((entry) => (
          <Button key={entry.id} variant="chip" selected={game === entry.id} onClick={() => setGame(entry.id)}>
            {t(CATALOG[entry.id].name)}
          </Button>
        ))}
      </div>
      {empty && (
        <p className="muted">
          {board === "each"
            ? (period === "month" ? t("lobby.board.emptyMonth") : t("lobby.board.empty"))
            : (period === "month" ? t("lobby.board.computerEmptyMonth") : t("lobby.board.computerEmpty"))}
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
                <td className="board-rank">{index + 1}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span>{player(row.id, row.name)}</span>
                  </span>
                </td>
                <td className="is-number"><strong>{row.won}</strong></td>
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
                <td className="board-rank">{index + 1}</td>
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
                <td className="is-number"><strong>{row.score}</strong></td>
                <td className="is-number muted">{t("lobby.board.wonOf", { won: row.won, played: row.played })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="lobby-panel-note muted">{board === "each" ? t("lobby.board.note") : t("lobby.board.computerNote")}</p>
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
        <Avatar id={myId} name={myName || "?"} size={44} />
        <div>
          <h2 id="lobby-month-title" className="lobby-section-title">{t("lobby.month.title")}</h2>
          <span className="muted lobby-month-when">{t("lobby.month.when", { month })}</span>
        </div>
      </div>
      {stats && (
        <>
          <dl className="month-stats">
            <div>
              <dt>{t("lobby.month.played")}</dt>
              <dd>{played}</dd>
            </div>
            <div>
              <dt>{t("lobby.month.won")}</dt>
              <dd>{won}</dd>
              {played > 0 && <span className="muted">{Math.round((won / played) * 100)}%</span>}
            </div>
            <div>
              <dt>{t("lobby.month.streak")}</dt>
              <dd>{stats.streak}</dd>
              <span className="muted">{t("lobby.month.streakWins", { count: stats.streak })}</span>
            </div>
          </dl>
          {played === 0 && <p className="muted">{t("lobby.month.empty")}</p>}
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
