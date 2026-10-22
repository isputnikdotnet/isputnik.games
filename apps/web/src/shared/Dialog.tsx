import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

// The one modal. A card over a backdrop; Escape and the backdrop close it unless
// `busy` says an action is running. Confirmations are the common case, so the
// footer is part of it: a verb for the confirm button, never "OK".
export function Dialog({
  title,
  children,
  onClose,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
  busy = false
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
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return createPortal(
    <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        {children && <div className="dialog-body">{children}</div>}
        <div className="dialog-actions">
          {cancelLabel && <Button variant="secondary" onClick={onCancel ?? onClose} disabled={busy}>{cancelLabel}</Button>}
          {confirmLabel && (
            <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy} autoFocus>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
