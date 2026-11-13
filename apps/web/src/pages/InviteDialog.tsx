import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, Copy, Gamepad2, Info, Link2, Mail, QrCode, Search, Send, Share2, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dominoes, Dots, GAMES, TIME_CONTROLS, timeControlKey, type DominoesTarget, type FleetKind, type PlayerIndex, type TimeControl } from "@isputnik/games-engine";
import { createGuestInvite, createMatch, fetchMembers, type GuestInviteCreated, type GuestLinkDays, type MatchSummary, type Member } from "../api";
import { matchHref } from "../router";
import { useSession } from "../session";
import { Avatar } from "../shared/Avatar";
import { Button } from "../shared/Button";
import { Dialog } from "../shared/Dialog";
import { MessageBox } from "../shared/MessageBox";
import { CATALOG } from "../games/catalog";
import { loadDotsSetup, saveDotsSetup } from "../games/dots/storage";
import { loadStarBattleSetup, saveStarBattleSetup } from "../games/starbattle/storage";
import { loadDominoesSetup, saveDominoesSetup } from "../games/dominoes/storage";
import { loadChessSetup, saveChessSetup } from "../games/chess/storage";
import { clockLabel } from "../games/chess/clockText";

const DOTS_TARGETS: (number | null)[] = [null, 5, 10, 20];
const LINK_DAYS: GuestLinkDays[] = [1, 7, 14];

/** A part of the form: an icon and a heading over its controls. */
function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="invite-section" aria-labelledby={id}>
      <h3 id={id} className="invite-section-title">
        <Icon size={20} aria-hidden="true" /> {title}
      </h3>
      {children}
    </section>
  );
}

// Inviting someone: which game, who, the game's own settings, and who starts.
// Each game's settings start from the last local setup and are saved back.
// "Who" is a member here, or — on the External invite tab — someone with no
// account (docs/plan.md → Guests): then the home server makes a link for them,
// shown once beside the form as a QR code and an address to copy or email,
// and the match waits for them to open it.
export function InviteDialog({ myId, game: initialGame = "dots", onClose, onSent }: {
  myId: string;
  /** The game picked to begin with (a game card's Invite). */
  game?: string;
  onClose: () => void;
  onSent: (match: MatchSummary) => void;
}) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const guestsAllowed = session.status === "ready" && session.guests;
  const myName = session.status === "ready" ? session.user.name : "";
  const [game, setGame] = useState<string>(initialGame);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [query, setQuery] = useState("");
  const [opponent, setOpponent] = useState<Member | null>(null);
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [days, setDays] = useState<GuestLinkDays>(7);
  const [size, setSize] = useState<number>(() => loadDotsSetup().size);
  const [target, setTarget] = useState<number | null>(() => loadDotsSetup().targetCaptures);
  const [fleet, setFleet] = useState<FleetKind>(() => loadStarBattleSetup().fleet);
  const [dominoesTarget, setDominoesTarget] = useState<DominoesTarget>(() => loadDominoesSetup().target);
  const [clock, setClock] = useState<TimeControl | null>(() => loadChessSetup().clock);
  const [seat, setSeat] = useState<PlayerIndex>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<GuestInviteCreated | null>(null);
  const [copied, setCopied] = useState(false);
  /** The confirm button was pressed with something missing: say what. */
  const [tried, setTried] = useState(false);

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
  const needle = query.trim().toLocaleLowerCase(i18n.language);
  const shown = (members ?? []).filter((member) => !needle || member.name.toLocaleLowerCase(i18n.language).includes(needle));
  // Once a link is made its match exists: the settings it was made with stay put.
  const locked = link !== null || busy;

  const send = async () => {
    if (!ready) {
      // Say what is missing rather than do nothing: a link needs the guest's name.
      setTried(true);
      if (guest) document.getElementById("invite-guest-name")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const options = game === "dots" ? { size, targetCaptures: target }
        : game === "starbattle" ? { fleet }
        : game === "dominoes" ? { target: dominoesTarget }
        : game === "chess" && clock ? { clock }
        : {};
      if (game === "dots") saveDotsSetup({ ...loadDotsSetup(), size, targetCaptures: target });
      else if (game === "starbattle") saveStarBattleSetup({ ...loadStarBattleSetup(), fleet });
      else if (game === "dominoes") saveDominoesSetup({ ...loadDominoesSetup(), target: dominoesTarget });
      else if (game === "chess") saveChessSetup({ ...loadChessSetup(), clock });
      if (guest) {
        setLink(await createGuestInvite({ game, options, seat, guestName: name, days }));
        setBusy(false);
      } else {
        onSent(await createMatch({ game, options, opponent: opponent!, seat }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      document.getElementById("invite-link-url")?.focus();
    }
  };

  const row = (label: string, children: ReactNode) => (
    <div className="setup-row" role="group" aria-label={label}>
      <span className="setup-label">{label}</span>
      {children}
    </div>
  );

  /** Which side the inviter takes, each with a swatch of its colour. */
  const sides = (label: string, options: { seat: PlayerIndex; label: string; swatch: string }[]) => row(label, (
    <div className="invite-sides">
      {options.map((option) => (
        <Button key={option.seat} variant="bare" className="invite-side" aria-pressed={seat === option.seat} onClick={() => setSeat(option.seat)} disabled={locked}>
          <span className={`invite-swatch is-${option.swatch}`} aria-hidden="true" />
          {option.label}
        </Button>
      ))}
    </div>
  ));

  const chip = (selected: boolean, onClick: () => void, label: string, key?: string | number) => (
    <Button key={key} variant="chip" selected={selected} onClick={onClick} disabled={locked}>{label}</Button>
  );

  const modeTab = (isGuest: boolean, Icon: LucideIcon, title: string, hint: string) => (
    <Button
      variant="bare"
      role="tab"
      aria-selected={guest === isGuest}
      className="invite-mode"
      onClick={() => setGuest(isGuest)}
      disabled={locked}
    >
      <span className="invite-mode-title"><Icon size={20} aria-hidden="true" /> {title}</span>
      <span className="invite-mode-hint">{hint}</span>
    </Button>
  );

  const tabs = guestsAllowed && (
    <div className="invite-modes" role="tablist">
      {modeTab(false, Users, t("invite.tabMember"), t("invite.tabMemberHint"))}
      {modeTab(true, Link2, t("invite.tabGuest"), t("invite.tabGuestHint"))}
    </div>
  );

  const gameSection = (
    <Section icon={Gamepad2} title={t("invite.game")}>
      <div className="invite-games">
        {GAMES.filter((entry) => CATALOG[entry.id]?.modes.includes("online")).map((entry) => {
          const Icon = CATALOG[entry.id].icon;
          const selected = game === entry.id;
          return (
            <Button key={entry.id} variant="bare" className="invite-tile" aria-pressed={selected} onClick={() => setGame(entry.id)} disabled={locked}>
              <Icon size={30} aria-hidden="true" />
              <span>{t(CATALOG[entry.id].name)}</span>
              {selected && <span className="invite-tile-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}
            </Button>
          );
        })}
      </div>
    </Section>
  );

  const settingsSection = (
    <Section icon={SlidersHorizontal} title={t("invite.settings")}>
      {game === "dots" && (
        <>
          {row(t("dots.setup.size"), (
            <div className="chip-row">
              {Dots.BOARD_SIZES.map((option) => chip(option === size, () => setSize(option), t("dots.setup.sizeValue", { size: option }), option))}
            </div>
          ))}
          {row(t("dots.setup.target"), (
            <div className="chip-row">
              {DOTS_TARGETS.map((option) => chip(option === target, () => setTarget(option),
                option === null ? t("dots.setup.targetFull") : t("dots.setup.targetN", { count: option }), String(option)))}
            </div>
          ))}
          {sides(t("invite.yourColour"), [
            { seat: 0, label: t("dots.players.blue"), swatch: "blue" },
            { seat: 1, label: t("dots.players.red"), swatch: "red" }
          ])}
        </>
      )}
      {game === "starbattle" && (
        <>
          {row(t("starbattle.setup.fleet"), (
            <div className="chip-row">
              {chip(fleet === "classic", () => setFleet("classic"), t("starbattle.setup.fleetClassic"))}
              {chip(fleet === "small", () => setFleet("small"), t("starbattle.setup.fleetSmall"))}
            </div>
          ))}
          {row(t("starbattle.setup.firesFirst"), (
            <div className="chip-row">
              {chip(seat === 0, () => setSeat(0), t("starbattle.players.you"))}
              {chip(seat === 1, () => setSeat(1), themName)}
            </div>
          ))}
        </>
      )}
      {(game === "chess" || game === "checkers") && sides(t("invite.yourColour"), [
        { seat: 0, label: t("chess.players.white"), swatch: "white" },
        { seat: 1, label: t("chess.players.black"), swatch: "black" }
      ])}
      {/* Chess may be played on the clock (blitz). */}
      {game === "chess" && row(t("chess.clock.label"), (
        <div className="chip-row">
          {chip(clock === null, () => setClock(null), t("chess.clock.off"), "off")}
          {TIME_CONTROLS.map((control) => chip(clock !== null && timeControlKey(clock) === timeControlKey(control), () => setClock(control), clockLabel(control, t), timeControlKey(control)))}
        </div>
      ))}
      {/* Who leads is the tiles' business, so Dominoes has no seat to pick. */}
      {game === "dominoes" && row(t("dominoes.setup.target"), (
        <div className="chip-row">
          {Dominoes.TARGETS.map((option) => chip(dominoesTarget === option, () => setDominoesTarget(option),
            t(option === 101 ? "dominoes.setup.target101" : "dominoes.setup.target51"), option))}
        </div>
      ))}
    </Section>
  );

  // ── Someone outside the family: the form on the left, the link on the right ──
  if (guest) {
    const until = link ? new Date(link.invite.expiresAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long" }) : "";
    const gameLabel = t(CATALOG[game]?.name ?? "games.dots.name");
    const mail = link
      ? `mailto:?subject=${encodeURIComponent(t("invite.emailSubject", { game: gameLabel, name: myName }))}&body=${encodeURIComponent(t("invite.emailBody", { game: gameLabel, guest: link.invite.guestName, name: myName, url: link.url, date: until }))}`
      : "";
    return (
      <Dialog
        title={t("invite.guestTitle")}
        lead={t("invite.guestLead")}
        icon={<Link2 size={30} />}
        closeLabel={t("invite.close")}
        onClose={link ? () => onSent(link.match) : onClose}
        busy={busy}
        wide
        className="is-guest"
        footer={(
          <>
            <p className="invite-note is-footer"><Info size={18} aria-hidden="true" /> {t("invite.guestNote")}</p>
            <Button variant="secondary" onClick={link ? () => onSent(link.match) : onClose} disabled={busy}>{t("invite.close")}</Button>
          </>
        )}
      >
        <div className="invite-form">
          {tabs}
          <div className="invite-guest">
            <div className="invite-guest-form">
              {gameSection}
              {settingsSection}
              <Section icon={Link2} title={t("invite.linkOptions")}>
                <div className="invite-link-options">
                  <div className="setup-row">
                    <label className="setup-label" htmlFor="invite-guest-name">{t("invite.guestName")}</label>
                    <input
                      id="invite-guest-name"
                      className="text-input"
                      type="text"
                      value={guestName}
                      maxLength={60}
                      autoComplete="off"
                      disabled={locked}
                      placeholder={t("invite.guestNamePlaceholder")}
                      aria-invalid={tried && !name}
                      aria-describedby={tried && !name ? "invite-guest-name-missing" : undefined}
                      onChange={(event) => setGuestName(event.target.value)}
                    />
                  </div>
                  <div className="setup-row">
                    <label className="setup-label" htmlFor="invite-link-days">{t("invite.expiresIn")}</label>
                    <span className="invite-select">
                      <Clock size={16} aria-hidden="true" />
                      <select id="invite-link-days" value={days} disabled={locked} onChange={(event) => setDays(Number(event.target.value) as GuestLinkDays)}>
                        {LINK_DAYS.map((option) => <option key={option} value={option}>{t("invite.days", { count: option })}</option>)}
                      </select>
                    </span>
                  </div>
                </div>
                {tried && !name && <p id="invite-guest-name-missing" className="invite-missing" role="alert">{t("invite.nameMissing")}</p>}
                <p className="muted invite-hint">{t("invite.guestHint")}</p>
              </Section>
            </div>

            <aside className="invite-share" aria-label={t("invite.shareAria")}>
              {link ? (
                <>
                  <div className="invite-qr">
                    <QRCodeSVG
                      value={link.url}
                      size={208}
                      level="H"
                      marginSize={0}
                      title={t("invite.qrAria")}
                      role="img"
                      aria-label={t("invite.qrAria")}
                      imageSettings={{ src: `${import.meta.env.BASE_URL}isputnik-app-icon.svg`, height: 44, width: 44, excavate: true }}
                    />
                  </div>
                  <p className="invite-scan">{t("invite.scan")}</p>
                  <p className="invite-or"><span>{t("invite.or")}</span></p>
                  <div className="invite-url">
                    <Link2 size={18} aria-hidden="true" />
                    <input id="invite-link-url" type="text" readOnly value={link.url} aria-label={t("copyLink.aria")} onFocus={(event) => event.currentTarget.select()} />
                    <Button variant="icon" className="invite-url-copy" aria-label={t("copyLink.copy")} title={t("copyLink.copy")} onClick={() => void copy()}>
                      {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                    </Button>
                  </div>
                  <div className="invite-share-actions">
                    <Button variant="primary" onClick={() => void copy()}>
                      {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {copied ? t("copyLink.copied") : t("copyLink.copy")}
                    </Button>
                    <a className="secondary-button" href={mail}><Mail size={18} aria-hidden="true" /> {t("invite.email")}</a>
                  </div>
                  <p className="muted invite-hint">
                    {t("invite.linkExpires", { date: until })}{" "}
                    <a className="text-link" href={matchHref(link.match.game, link.match.id)} onClick={(event) => { event.preventDefault(); onSent(link.match); }}>
                      {t("invite.openMatch")}
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <div className="invite-qr is-empty" aria-hidden="true"><QrCode size={72} strokeWidth={1.2} /></div>
                  <p className="muted invite-share-lead">{t("invite.qrPlaceholder")}</p>
                  <Button variant="primary" className="invite-create" onClick={() => void send()} disabled={busy}>
                    <Link2 size={18} aria-hidden="true" /> {busy ? t("invite.creating") : t("invite.createLink")}
                  </Button>
                </>
              )}
              {error !== null && <MessageBox tone="error" title={t("invite.linkFailed")}>{error}</MessageBox>}
            </aside>
            {/* On a phone the note scrolls with the form, leaving the footer to Close. */}
            <p className="invite-note is-body"><Info size={18} aria-hidden="true" /> {t("invite.guestNote")}</p>
          </div>
        </div>
      </Dialog>
    );
  }

  // ── A member ──
  return (
    <Dialog
      title={t("invite.title")}
      lead={t("invite.lead")}
      icon={<Gamepad2 size={30} />}
      closeLabel={t("invite.close")}
      confirmLabel={t("invite.send")}
      confirmIcon={<Send size={18} aria-hidden="true" />}
      cancelLabel={t("invite.cancel")}
      onConfirm={send}
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="invite-form">
        {tabs}
        {gameSection}
        <Section icon={Users} title={t("invite.member")}>
          {members === null ? (
            <p className="muted">{t("app.loading")}</p>
          ) : members.length === 0 ? (
            <p className="muted">{t("invite.noMembers")}</p>
          ) : (
            <>
              <label className="invite-search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  autoComplete="off"
                  placeholder={t("invite.search")}
                  aria-label={t("invite.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {shown.length === 0 ? (
                <p className="muted invite-hint">{t("invite.noMatch")}</p>
              ) : (
                <div className="invite-people" role="radiogroup" aria-label={t("invite.member")}>
                  {shown.map((member) => {
                    const selected = opponent?.id === member.id;
                    return (
                      <Button
                        key={member.id}
                        variant="bare"
                        role="radio"
                        aria-checked={selected}
                        className="invite-person"
                        onClick={() => setOpponent(member)}
                      >
                        <span className="invite-check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
                        <Avatar id={member.id} name={member.name} size={34} />
                        <span className="invite-person-name">{member.name}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Section>
        {settingsSection}
        {!ready && members && members.length > 0 && (
          <p className={tried ? "invite-missing" : "muted invite-hint"} role={tried ? "alert" : undefined}>{t("invite.pickSomeone")}</p>
        )}
        {error !== null && <MessageBox tone="error" title={t("invite.failed")}>{error}</MessageBox>}
      </div>
    </Dialog>
  );
}
