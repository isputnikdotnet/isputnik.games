import type { ReactNode } from "react";

export type MessageTone = "info" | "warning" | "error" | "success";

/** An inline notice with a tone, never a custom error div. */
export function MessageBox({ tone, title, children }: { tone: MessageTone; title: string; children?: ReactNode }) {
  return (
    <div className={`message-box is-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
