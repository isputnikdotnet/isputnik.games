/** A new local game's own id: kept in its save, and sent with its result
 *  against the computer so the server keeps that result once
 *  (useComputerResult). */
export function newGameKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
