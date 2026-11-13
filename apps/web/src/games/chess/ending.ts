import type { TFunction } from "i18next";
type T = TFunction;

/** Why a game of chess ended, in a sentence. `resigned` names the side that
 *  lost it — who gave up, or whose clock ran out; `draw` says nobody won. */
export function chessReason(reason: string | null, resigned: string, t: T, draw = false): string | null {
  switch (reason) {
    case "checkmate": return t("chess.end.reasonCheckmate");
    case "stalemate": return t("chess.end.reasonStalemate");
    case "repetition": return t("chess.end.reasonRepetition");
    case "fifty-moves": return t("chess.end.reasonFiftyMoves");
    case "material": return t("chess.end.reasonMaterial");
    case "agreed": return t("chess.end.reasonAgreed");
    case "resigned": return t("chess.end.reasonResigned", { player: resigned });
    case "timeout": return t(draw ? "chess.end.reasonTimeoutDraw" : "chess.end.reasonTimeout", { player: resigned });
    default: return null;
  }
}
