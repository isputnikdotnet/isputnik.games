import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { ApiError, fetchGuestInvite, renewGuestInvite, revokeGuestInvite, type GuestInvite } from "../api";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { MessageBox } from "./MessageBox";
import { CopyLink } from "./CopyLink";

// The inviter's view of a guest link (docs/plan.md → Guests), on the match
// page: whether the guest has opened it, until when it works, a new link when
// the old one was lost or leaked, and revoking it. The link itself is shown
// only right after it is made — the home server keeps nothing but its hash.
export function GuestLinkPanel({ matchId, guestName }: { matchId: string; guestName: string }) {
  const { t, i18n } = useTranslation();
  const [invite, setInvite] = useState<GuestInvite | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvite(await fetchGuestInvite(matchId));
    } catch {
      setInvite(null);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!invite) return null;

  const date = (value: string) => new Date(value).toLocaleDateString(i18n.language, { day: "numeric", month: "long" });

  const act = async (what: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await what();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("guestLink.failed"));
    } finally {
      setBusy(false);
    }
  };

  const renew = () => act(async () => {
    const renewed = await renewGuestInvite(invite.id);
    setInvite(renewed.invite);
    setUrl(renewed.url);
  });

  const revoke = () => act(async () => {
    setConfirmRevoke(false);
    setInvite((await revokeGuestInvite(invite.id)).invite);
    setUrl(null);
  });

  let status: string;
  if (invite.state === "revoked") status = t("guestLink.revoked");
  else if (invite.state === "expired") status = t("guestLink.expired");
  else if (invite.openedCount === 0) status = t("guestLink.notOpened");
  else status = t("guestLink.opened", { count: invite.openedCount, date: date(invite.lastSeenAt ?? invite.firstOpenedAt ?? invite.createdAt) });

  return (
    <section className="guest-link-panel" aria-label={t("guestLink.title")}>
      <h3><Link2 size={16} aria-hidden="true" /> {t("guestLink.title")}</h3>
      <p className="muted">
        {status}
        {invite.state === "live" && ` · ${t("guestLink.expires", { date: date(invite.expiresAt) })}`}
      </p>
      {url && (
        <>
          <p className="muted">{t("guestLink.newLinkLead", { name: guestName })}</p>
          <CopyLink url={url} />
        </>
      )}
      {error && <MessageBox tone="error" title={t("guestLink.failed")}>{error}</MessageBox>}
      <div className="guest-link-actions">
        <Button variant="secondary" onClick={() => void renew()} disabled={busy}>{t("guestLink.renew")}</Button>
        {invite.state === "live" && (
          <Button variant="text" onClick={() => setConfirmRevoke(true)} disabled={busy}>{t("guestLink.revoke")}</Button>
        )}
      </div>
      {confirmRevoke && (
        <Dialog
          title={t("guestLink.confirmRevoke.title")}
          confirmLabel={t("guestLink.confirmRevoke.confirm")}
          cancelLabel={t("guestLink.confirmRevoke.cancel")}
          danger
          busy={busy}
          onConfirm={() => void revoke()}
          onClose={() => setConfirmRevoke(false)}
        >
          {t("guestLink.confirmRevoke.body", { name: guestName })}
        </Dialog>
      )}
    </section>
  );
}
