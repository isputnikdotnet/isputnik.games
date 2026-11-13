import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

// The one modal. A card over a backdrop; Escape and the backdrop close it unless
// `busy` says an action is running. Confirmations are the common case, so the
// footer is part of it: a verb for the confirm button, never "OK".
// A form-sized dialog (the invite) is `wide`: an icon and a lead line in its
// header, a close button in the corner, and a body that scrolls on a short screen.
export function Dialog({
  title,
  children,
  onClose,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
  busy = false,
  icon,
  lead,
  closeLabel,
  confirmIcon,
  wide = false,
  className,
  footer
}: {
  title: string;
  children?: ReactNode;
  /** Escape, the backdrop — and the cancel button unless onCancel says otherwise. */
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  /** When the cancel button is an action of its own (a result dialog's "Change
   *  settings"), not merely a way to dismiss. */
  onCancel?: () => void;
  danger?: boolean;
  busy?: boolean;
  /** A picture for the header, in a tile beside the title. */
  icon?: ReactNode;
  /** One line under the title. */
  lead?: string;
  /** Shows a close button in the corner, named this. */
  closeLabel?: string;
  /** An icon before the confirm label. */
  confirmIcon?: ReactNode;
  wide?: boolean;
  /** More classes on the card, for a dialog with a layout of its own. */
  className?: string;
  /** A footer of the dialog's own, in place of the cancel and confirm buttons. */
  footer?: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const fancy = Boolean(icon || lead || closeLabel);
  return createPortal(
    <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
      <div
        className={`dialog-card${wide ? " is-wide" : ""}${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {fancy ? (
          <div className="dialog-head">
            {icon && <span className="dialog-head-icon" aria-hidden="true">{icon}</span>}
            <div className="dialog-head-text">
              <h2 id={titleId}>{title}</h2>
              {lead && <p className="muted">{lead}</p>}
            </div>
            {closeLabel && (
              <Button variant="icon" className="dialog-close" aria-label={closeLabel} title={closeLabel} onClick={onClose} disabled={busy}>
                <X size={18} aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : (
          <h2 id={titleId}>{title}</h2>
        )}
        {children && <div className="dialog-body">{children}</div>}
        <div className="dialog-actions">
          {footer}
          {cancelLabel && <Button variant="secondary" onClick={onCancel ?? onClose} disabled={busy}>{cancelLabel}</Button>}
          {confirmLabel && (
            <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy} autoFocus={!wide}>
              {confirmIcon}
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
