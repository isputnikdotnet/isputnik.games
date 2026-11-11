// Results that could not reach the server, kept on the device until they can:
// a finished game against the computer, a chess game for review, an arcade run.
// Each is a POST the server already treats as "one per key", so sending one
// twice changes nothing. They belong to whoever was signed in when they were
// made — another member on the same device never sends them as their own.

const KEY = "isputnik-games.outbox";
/** Old entries fall off the front: a device a year offline keeps the latest. */
const LIMIT = 100;

export interface Queued {
  path: string;
  body: unknown;
}

interface Stored extends Queued {
  user: string;
}

let owner = "";

/** Who is signed in on this device; results queued from now on are theirs. */
export function setOutboxOwner(id: string): void {
  owner = id;
}

function read(): Stored[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Stored[]) : [];
  } catch {
    return [];
  }
}

function write(entries: Stored[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(entries.slice(-LIMIT)));
  } catch {
    /* private mode, or full: the result is this device's only */
  }
}

/** What makes two entries the same result: its key where it has one. */
function nameOf(entry: Queued): string {
  const key = (entry.body as { key?: unknown } | null)?.key;
  return `${entry.path}#${typeof key === "string" ? key : JSON.stringify(entry.body)}`;
}

function remove(entry: Queued, user: string): void {
  const name = nameOf(entry);
  const all = read();
  const rest = all.filter((other) => !(other.user === user && nameOf(other) === name));
  if (rest.length !== all.length) write(rest);
}

/** The server said no (a result it will never take): not worth keeping. Being
 *  signed out is not that — the result goes once the member is back. */
function refused(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 401;
}

/** Sends now; if the server cannot be reached, keeps it to send later. The
 *  caller still sees the failure, so the page can say "not saved yet". */
export async function sendOrQueue<T>(send: () => Promise<T>, entry: Queued): Promise<T> {
  const user = owner;
  try {
    const answer = await send();
    remove(entry, user);
    return answer;
  } catch (error) {
    if (user && !refused(error)) {
      remove(entry, user);
      write([...read(), { ...entry, user }]);
    }
    throw error;
  }
}

let flushing: Promise<number> | null = null;

/** Sends what waits for the signed-in member, oldest first; stops at the first
 *  one the server cannot be reached for. Answers how many went. */
export function flushOutbox(send: (entry: Queued) => Promise<unknown>): Promise<number> {
  flushing ??= (async () => {
    const user = owner;
    let sent = 0;
    for (const entry of read().filter((stored) => stored.user === user)) {
      try {
        await send(entry);
        sent += 1;
      } catch (error) {
        if (!refused(error)) break;
      }
      remove(entry, user);
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** How many results wait to be sent for the signed-in member. */
export function queuedCount(): number {
  return read().filter((stored) => stored.user === owner).length;
}
