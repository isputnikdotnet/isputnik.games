import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "./Button";
import type { CommsLine } from "./commsLines";

// The one Comms panel every game wears: a dark console, one line per move in
// the game's own words, what the players said in between, and — online only —
// a prompt to say something and a few one-tap phrases. Who is always the same
// two colours; only a result is coloured otherwise.
export function Comms({
  lines,
  onSend,
  phrases = [],
  sendTo,
  busy = false,
  error = null
}: {
  lines: CommsLine[];
  /** Present on an online match: what to do with a typed or tapped line. */
  onSend?: (text: string) => void;
  phrases?: string[];
  /** The other player's name, for the prompt. */
  sendTo?: string;
  busy?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);

  // The newest line is the one that matters: keep the panel scrolled to it.
  useEffect(() => {
    const node = list.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !onSend || busy) return;
    onSend(text);
    setDraft("");
  };

  return (
    <section className="comms" aria-label={t("comms.title")}>
      <header className="comms-head">
        <span>{t("comms.title")}</span>
        <span className="comms-live">{t("comms.live")} <span className="comms-live-dot" aria-hidden="true" /></span>
      </header>
      <div className="comms-lines" ref={list} role="log" aria-live="polite">
        {lines.map((line) => (
          <div key={line.key} className={`comms-line is-${line.kind}${line.who ? ` is-${line.who}` : ""}`}>
            {line.kind === "system"
              ? <span className="comms-system">— {line.text}</span>
              : (
                <>
                  <span className="comms-name"><span className="comms-mark" aria-hidden="true">{line.who === "you" ? "●" : "■"}</span> {line.name}</span>
                  <span className={line.kind === "say" ? "comms-say" : "comms-text"}>{line.kind === "say" ? `“${line.text}”` : line.text}</span>
                  {line.result && <span className={`comms-result is-${line.result.tone}`}>{line.result.text}</span>}
                </>
              )}
          </div>
        ))}
      </div>
      {onSend && (
        <>
          <form className="comms-prompt" onSubmit={submit}>
            <span className="comms-caret" aria-hidden="true">&gt;</span>
            <label htmlFor="comms-say" className="visually-hidden">{t("comms.send")}</label>
            <input
              id="comms-say"
              type="text"
              value={draft}
              maxLength={120}
              placeholder={t("comms.placeholder", { name: sendTo ?? "" })}
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
              disabled={busy}
            />
            <Button variant="icon" type="submit" className="comms-send" aria-label={t("comms.send")} disabled={busy || !draft.trim()}>
              <Send size={16} aria-hidden="true" />
            </Button>
          </form>
          {phrases.length > 0 && (
            <div className="comms-quick">
              {phrases.map((phrase) => (
                <Button key={phrase} variant="chip" className="comms-chip" onClick={() => onSend(phrase)} disabled={busy}>{phrase}</Button>
              ))}
            </div>
          )}
          {error && <p className="comms-error">{error}</p>}
        </>
      )}
    </section>
  );
}
