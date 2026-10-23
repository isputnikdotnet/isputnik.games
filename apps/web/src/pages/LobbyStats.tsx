import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { GAMES } from "@isputnik/games-engine";
import type { FamilyStats, StatsRow } from "../api";
import { Avatar } from "../shared/Avatar";
import { Button } from "../shared/Button";
import { CATALOG } from "../games/catalog";

// The lobby's two panels on the family's results (the server's /stats): who
// has won most, this month or for all time, in one game or all of them; and
// the member's own month. Only online games between members count — the
// footnote says so, because a child who beats the computer every day would
// otherwise wonder where their wins went.

type Period = "month" | "all";

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

const gamesOffered = () => GAMES.filter((game) => CATALOG[game.id]);

export function Leaderboard({ stats, myId }: { stats: FamilyStats | null; myId: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("month");
  const [game, setGame] = useState<string | null>(null);
  const rows = stats ? standings(stats[period], game) : [];

  return (
    <section className="lobby-panel lobby-board" aria-labelledby="lobby-board-title">
      <div className="lobby-panel-head">
        <h2 id="lobby-board-title" className="lobby-section-title">
          <Trophy size={18} aria-hidden="true" className="lobby-board-trophy" /> {t("lobby.board.title")}
        </h2>
        <div className="chip-row" role="group" aria-label={t("lobby.board.period")}>
          <Button variant="chip" selected={period === "month"} onClick={() => setPeriod("month")}>{t("lobby.board.month")}</Button>
          <Button variant="chip" selected={period === "all"} onClick={() => setPeriod("all")}>{t("lobby.board.all")}</Button>
        </div>
      </div>
      <div className="chip-row lobby-board-games" role="group" aria-label={t("lobby.board.game")}>
        <Button variant="chip" selected={game === null} onClick={() => setGame(null)}>{t("lobby.board.allGames")}</Button>
        {gamesOffered().map((entry) => (
          <Button key={entry.id} variant="chip" selected={game === entry.id} onClick={() => setGame(entry.id)}>
            {t(CATALOG[entry.id].name)}
          </Button>
        ))}
      </div>
      {stats && rows.length === 0 && (
        <p className="muted">{period === "month" ? t("lobby.board.emptyMonth") : t("lobby.board.empty")}</p>
      )}
      {rows.length > 0 && (
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
            {rows.map((row, index) => (
              <tr key={row.id} className={row.id === myId ? "is-me" : undefined}>
                <td className="board-rank">{index + 1}</td>
                <td>
                  <span className="board-player">
                    <Avatar id={row.id} name={row.name} size={30} />
                    <span>{row.id === myId ? t("lobby.board.you", { name: row.name }) : row.name}</span>
                  </span>
                </td>
                <td className="is-number"><strong>{row.won}</strong></td>
                <td className="is-number muted">{row.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="lobby-panel-note muted">{t("lobby.board.note")}</p>
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
