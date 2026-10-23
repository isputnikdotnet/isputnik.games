/** "now", "20 minutes ago", "yesterday", "3 days ago" in the reader's language;
 *  past a week, the date ("12 Oct"). */
export function ago(iso: string, language: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const words = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (seconds < 60) return words.format(0, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return words.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return words.format(-days, "day");
  return new Date(then).toLocaleDateString(language, { day: "numeric", month: "short" });
}
