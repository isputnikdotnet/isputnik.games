import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dots, type PlayerIndex } from "@isputnik/games-engine";
import { createMatch, fetchMembers, type MatchSummary, type Member } from "../../api";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { MessageBox } from "../../shared/MessageBox";
import { loadDotsSetup, saveDotsSetup } from "./storage";

const TARGETS: (number | null)[] = [null, 5, 10, 20];

// Inviting a member to a game of Dots: who, how big a board, play to what, and
// which colour you take. The board and target start from the last local setup.
export function InviteDialog({ myId, onClose, onSent }: { myId: string; onClose: () => void; onSent: (match: MatchSummary) => void }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [opponent, setOpponent] = useState<Member | null>(null);
  const [size, setSize] = useState<number>(() => loadDotsSetup().size);
  const [target, setTarget] = useState<number | null>(() => loadDotsSetup().targetCaptures);
  const [seat, setSeat] = useState<PlayerIndex>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMembers()
      .then((list) => {
        if (!cancelled) setMembers(list.filter((member) => member.id !== myId));
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const send = async () => {
    if (!opponent) return;
    setBusy(true);
    setError(null);
    try {
      const match = await createMatch({ game: "dots", options: { size, targetCaptures: target }, opponent, seat });
      const setup = loadDotsSetup();
      saveDotsSetup({ ...setup, size, targetCaptures: target });
      onSent(match);
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("invite.title")}
      confirmLabel={t("invite.send")}
      cancelLabel={t("invite.cancel")}
      onConfirm={send}
      onClose={onClose}
      busy={busy}
    >
      <div className="invite-form">
        <div className="setup-row" role="group" aria-label={t("invite.member")}>
          <span className="setup-label">{t("invite.member")}</span>
          {members === null ? (
            <p className="muted">{t("app.loading")}</p>
          ) : members.length === 0 ? (
            <p className="muted">{t("invite.noMembers")}</p>
          ) : (
            <div className="chip-row">
              {members.map((member) => (
                <Button key={member.id} variant="chip" selected={opponent?.id === member.id} onClick={() => setOpponent(member)}>
                  {member.name}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="setup-row" role="group" aria-label={t("dots.setup.size")}>
          <span className="setup-label">{t("dots.setup.size")}</span>
          <div className="chip-row">
            {Dots.BOARD_SIZES.map((option) => (
              <Button key={option} variant="chip" selected={option === size} onClick={() => setSize(option)}>
                {t("dots.setup.sizeValue", { size: option })}
              </Button>
            ))}
          </div>
        </div>
        <div className="setup-row" role="group" aria-label={t("dots.setup.target")}>
          <span className="setup-label">{t("dots.setup.target")}</span>
          <div className="chip-row">
            {TARGETS.map((option) => (
              <Button key={String(option)} variant="chip" selected={option === target} onClick={() => setTarget(option)}>
                {option === null ? t("dots.setup.targetFull") : t("dots.setup.targetN", { count: option })}
              </Button>
            ))}
          </div>
        </div>
        <div className="setup-row" role="group" aria-label={t("invite.yourColour")}>
          <span className="setup-label">{t("invite.yourColour")}</span>
          <div className="chip-row">
            <Button variant="chip" selected={seat === 0} onClick={() => setSeat(0)}>{t("dots.players.blue")}</Button>
            <Button variant="chip" selected={seat === 1} onClick={() => setSeat(1)}>{t("dots.players.red")}</Button>
          </div>
        </div>
        {!opponent && members && members.length > 0 && <p className="muted invite-hint">{t("invite.pickSomeone")}</p>}
        {error !== null && <MessageBox tone="error" title={t("invite.failed")}>{error}</MessageBox>}
      </div>
    </Dialog>
  );
}
