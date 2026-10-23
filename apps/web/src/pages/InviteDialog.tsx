import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dots, GAMES, type FleetKind, type PlayerIndex } from "@isputnik/games-engine";
import { createGuestInvite, createMatch, fetchMembers, type GuestInviteCreated, type MatchSummary, type Member } from "../api";
import { useSession } from "../session";
import { Button } from "../shared/Button";
import { CopyLink } from "../shared/CopyLink";
import { Dialog } from "../shared/Dialog";
import { MessageBox } from "../shared/MessageBox";
import { CATALOG } from "../games/catalog";
import { loadDotsSetup, saveDotsSetup } from "../games/dots/storage";
import { loadStarBattleSetup, saveStarBattleSetup } from "../games/starbattle/storage";

const DOTS_TARGETS: (number | null)[] = [null, 5, 10, 20];

// Inviting a member: which game, who, the game's own settings, and who starts.
// Each game's settings start from the last local setup and are saved back.
// "Who" may also be someone with no account (docs/plan.md → Guests): then the
// home server makes a link for them, shown here once, and the match waits for
// them to open it.
export function InviteDialog({ myId, onClose, onSent }: { myId: string; onClose: () => void; onSent: (match: MatchSummary) => void }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const guestsAllowed = session.status === "ready" && session.guests;
  const [game, setGame] = useState<string>("dots");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [opponent, setOpponent] = useState<Member | null>(null);
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [size, setSize] = useState<number>(() => loadDotsSetup().size);
  const [target, setTarget] = useState<number | null>(() => loadDotsSetup().targetCaptures);
  const [fleet, setFleet] = useState<FleetKind>(() => loadStarBattleSetup().fleet);
  const [seat, setSeat] = useState<PlayerIndex>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<GuestInviteCreated | null>(null);

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

  const name = guest ? guestName.trim() : "";
  const ready = guest ? name.length > 0 : opponent !== null;
  const themName = guest ? (name || t("invite.them")) : (opponent?.name ?? t("invite.them"));

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const options = game === "dots" ? { size, targetCaptures: target } : { fleet };
      if (game === "dots") saveDotsSetup({ ...loadDotsSetup(), size, targetCaptures: target });
      else saveStarBattleSetup({ ...loadStarBattleSetup(), fleet });
      if (guest) {
        setLink(await createGuestInvite({ game, options, seat, guestName: name }));
        setBusy(false);
      } else {
        onSent(await createMatch({ game, options, opponent: opponent!, seat }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
      setBusy(false);
    }
  };

  const row = (label: string, children: React.ReactNode) => (
    <div className="setup-row" role="group" aria-label={label}>
      <span className="setup-label">{label}</span>
      {children}
    </div>
  );

  // The link, once: after this the match page offers a new one, never this one.
  if (link) {
    const until = new Date(link.invite.expiresAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long" });
    return (
      <Dialog title={t("invite.linkTitle", { name: link.invite.guestName })} confirmLabel={t("invite.openMatch")} onConfirm={() => onSent(link.match)} onClose={() => onSent(link.match)}>
        <div className="invite-form">
          <p>{t("invite.linkLead", { name: link.invite.guestName })}</p>
          <CopyLink url={link.url} />
          <p className="muted invite-hint">{t("invite.linkExpires", { date: until })}</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={t("invite.title")}
      confirmLabel={guest ? t("invite.makeLink") : t("invite.send")}
      cancelLabel={t("invite.cancel")}
      onConfirm={send}
      onClose={onClose}
      busy={busy}
    >
      <div className="invite-form">
        {row(t("invite.game"), (
          <div className="chip-row">
            {GAMES.filter((entry) => CATALOG[entry.id]).map((entry) => (
              <Button key={entry.id} variant="chip" selected={game === entry.id} onClick={() => setGame(entry.id)}>
                {t(CATALOG[entry.id].name)}
              </Button>
            ))}
          </div>
        ))}
        {row(t("invite.member"), members === null ? (
          <p className="muted">{t("app.loading")}</p>
        ) : members.length === 0 && !guestsAllowed ? (
          <p className="muted">{t("invite.noMembers")}</p>
        ) : (
          <div className="chip-row">
            {members.map((member) => (
              <Button key={member.id} variant="chip" selected={!guest && opponent?.id === member.id} onClick={() => { setGuest(false); setOpponent(member); }}>
                {member.name}
              </Button>
            ))}
            {guestsAllowed && (
              <Button variant="chip" selected={guest} onClick={() => setGuest(true)}>
                {t("invite.guestChip")}
              </Button>
            )}
          </div>
        ))}
        {guest && (
          <div className="setup-row">
            <label className="setup-label" htmlFor="invite-guest-name">{t("invite.guestName")}</label>
            <input
              id="invite-guest-name"
              className="text-input"
              type="text"
              value={guestName}
              maxLength={60}
              autoComplete="off"
              placeholder={t("invite.guestNamePlaceholder")}
              onChange={(event) => setGuestName(event.target.value)}
            />
            <p className="muted invite-hint">{t("invite.guestHint")}</p>
          </div>
        )}
        {game === "dots" && (
          <>
            {row(t("dots.setup.size"), (
              <div className="chip-row">
                {Dots.BOARD_SIZES.map((option) => (
                  <Button key={option} variant="chip" selected={option === size} onClick={() => setSize(option)}>
                    {t("dots.setup.sizeValue", { size: option })}
                  </Button>
                ))}
              </div>
            ))}
            {row(t("dots.setup.target"), (
              <div className="chip-row">
                {DOTS_TARGETS.map((option) => (
                  <Button key={String(option)} variant="chip" selected={option === target} onClick={() => setTarget(option)}>
                    {option === null ? t("dots.setup.targetFull") : t("dots.setup.targetN", { count: option })}
                  </Button>
                ))}
              </div>
            ))}
            {row(t("invite.yourColour"), (
              <div className="chip-row">
                <Button variant="chip" selected={seat === 0} onClick={() => setSeat(0)}>{t("dots.players.blue")}</Button>
                <Button variant="chip" selected={seat === 1} onClick={() => setSeat(1)}>{t("dots.players.red")}</Button>
              </div>
            ))}
          </>
        )}
        {game === "starbattle" && (
          <>
            {row(t("starbattle.setup.fleet"), (
              <div className="chip-row">
                <Button variant="chip" selected={fleet === "classic"} onClick={() => setFleet("classic")}>{t("starbattle.setup.fleetClassic")}</Button>
                <Button variant="chip" selected={fleet === "small"} onClick={() => setFleet("small")}>{t("starbattle.setup.fleetSmall")}</Button>
              </div>
            ))}
            {row(t("starbattle.setup.firesFirst"), (
              <div className="chip-row">
                <Button variant="chip" selected={seat === 0} onClick={() => setSeat(0)}>{t("starbattle.players.you")}</Button>
                <Button variant="chip" selected={seat === 1} onClick={() => setSeat(1)}>{themName}</Button>
              </div>
            ))}
          </>
        )}
        {!ready && !guest && members && members.length > 0 && <p className="muted invite-hint">{t("invite.pickSomeone")}</p>}
        {error !== null && <MessageBox tone="error" title={guest ? t("invite.linkFailed") : t("invite.failed")}>{error}</MessageBox>}
      </div>
    </Dialog>
  );
}
