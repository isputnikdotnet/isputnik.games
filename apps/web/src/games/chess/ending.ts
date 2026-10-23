type T = (key:
  | "chess.end.reasonCheckmate" | "chess.end.reasonStalemate" | "chess.end.reasonRepetition"
  | "chess.end.reasonFiftyMoves" | "chess.end.reasonMaterial" | "chess.end.reasonAgreed" | "chess.end.reasonResigned",
  options?: Record<string, unknown>) => string;

/** Why a game of chess ended, in a sentence; `resigned` names who gave up. */
export function chessReason(reason: string | null, resigned: string, t: T): string | null {
  switch (reason) {
    case "checkmate": return t("chess.end.reasonCheckmate");
    case "stalemate": return t("chess.end.reasonStalemate");
    case "repetition": return t("chess.end.reasonRepetition");
    case "fifty-moves": return t("chess.end.reasonFiftyMoves");
    case "material": return t("chess.end.reasonMaterial");
    case "agreed": return t("chess.end.reasonAgreed");
    case "resigned": return t("chess.end.reasonResigned", { player: resigned });
    default: return null;
  }
}
