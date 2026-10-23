import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { fetchMyGames, type ReviewItem } from "../../api";
import { MessageBox } from "../../shared/MessageBox";
import { follow, href } from "../../router";

const LEVEL_LABEL = { easy: "chess.setup.levelEasy", normal: "chess.setup.levelNormal", hard: "chess.setup.levelHard" } as const;

/** Where a game is reviewed: a kept one by its record, an online one by its match. */
export function reviewHref(item: Pick<ReviewItem, "source" | "id">): string {
  return href(item.source === "record" ? `chess/review/${item.id}` : `chess/review/m/${item.id}`);
}

// My games: the member's finished chess games, online and on this or any
// other device, newest first, each opening the review. A game abandoned
// half-way (New game, Exit) was never finished and is not here.
export function MyChessGamesPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMyGames().then((list) => live && setItems(list), (failure: unknown) => live && setError(failure instanceof Error ? failure.message : String(failure)));
    return () => {
      live = false;
    };
  }, []);

  const outcome = (item: ReviewItem): { text: string; tone: "won" | "lost" | "drawn" | "neutral" } => {
    if (item.winner === null) return { text: t("chess.review.drawn"), tone: "drawn" };
    if (item.seat === null) return { text: t("chess.end.winner", { player: t(item.winner === 0 ? "chess.players.white" : "chess.players.black") }), tone: "neutral" };
    return item.winner === item.seat ? { text: t("chess.review.won"), tone: "won" } : { text: t("chess.review.lost"), tone: "lost" };
  };
  const against = (item: ReviewItem) => {
    if (item.mode === "online") return t("chess.review.vs", { name: item.opponent ?? "?" });
    if (item.mode === "local") return t("chess.review.local");
    return t("chess.review.vs", { name: item.level ? t("chess.review.computerAt", { level: t(LEVEL_LABEL[item.level]) }) : t("chess.players.computer") });
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="chess-page my-games">
      <header className="page-head page-head-row">
        <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
        </a>
        <h1>{t("chess.review.myGames")}</h1>
      </header>
      {error && <MessageBox tone="error" title={t("chess.review.listError")}>{error}</MessageBox>}
      {!items && !error && <p className="muted">{t("chess.review.loading")}</p>}
      {items && items.length === 0 && <p className="muted">{t("chess.review.empty")}</p>}
      {items && items.length > 0 && (
        <ul className="recent-list my-games-list">
          {items.map((item) => {
            const result = outcome(item);
            const to = reviewHref(item);
            return (
              <li key={`${item.source}-${item.id}`}>
                <a className="recent-row my-games-row" href={to} onClick={(event) => follow(event, to)}>
                  <span className={`my-games-result is-${result.tone}`}>{result.text}</span>
                  <span className="recent-row-main">
                    <span>{against(item)}</span>
                    <span className="muted">{[when(item.finishedAt), t("chess.end.moves", { count: Math.ceil(item.moveCount / 2) })].join(" · ")}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" className="muted" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
