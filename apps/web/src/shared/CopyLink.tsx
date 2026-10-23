import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button";

// A link to hand on: the address in a read-only box (selectable, for the
// devices where the clipboard is not ours to write) and a Copy button.
export function CopyLink({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the box is there to select from */
    }
  };

  return (
    <div className="copy-link">
      <input
        className="copy-link-input"
        type="text"
        readOnly
        value={url}
        aria-label={t("copyLink.aria")}
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button variant="secondary" onClick={() => void copy()}>
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? t("copyLink.copied") : t("copyLink.copy")}
      </Button>
    </div>
  );
}
