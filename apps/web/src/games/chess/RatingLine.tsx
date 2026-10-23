import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchChessRating, type ChessRating } from "../../api";

/** The member's chess rating once `key` (a finished online match) is set; null before. */
export function useChessRatingAfter(key: string | null): ChessRating | null {
  const [rating, setRating] = useState<{ key: string; value: ChessRating } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetchChessRating().then((value) => live && setRating({ key, value }), () => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return key && rating?.key === key ? rating.value : null;
}

/** "Chess rating 1032 +8", and "provisional" for the first ten games: under a
 *  finished game against the computer or online. */
export function ChessRatingLine({ rating }: { rating: ChessRating }) {
  const { t } = useTranslation();
  const change = rating.change;
  return (
    <p className="puzzle-rating chess-rating-line">
      <span className="muted">{t("chess.rating.label")}</span>{" "}
      <strong>{rating.rating}</strong>
      {change !== null && (
        <span className={`puzzle-change ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`}>
          {change > 0 ? `+${change}` : change < 0 ? `−${-change}` : "±0"}
        </span>
      )}
      {rating.provisional && <span className="muted chess-rating-provisional">{t("chess.rating.provisional")}</span>}
    </p>
  );
}
