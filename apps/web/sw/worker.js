/* global FILES, VERSION */
// The games, kept on the device: the page, its code and its pictures are stored
// when this worker installs (the first visit after a release), so the installed
// iSputnik app opens /games with no network at all. vite.config.ts puts the
// build's file list and a version above this text and emits it as /games/sw.js.
//
// Its scope is /games/ — narrower than the home app's worker at "/", so pages
// here are this worker's and the home app's are still its own. The API is never
// answered from here: what needs the server says so in the app (src/offline.ts
// remembers who is signed in, src/outbox.ts holds what is sent later).

const SCOPE = new URL("./", self.location.href).pathname;
const PREFIX = "isputnik-games-";
const CACHE = `${PREFIX}${VERSION}`;
/** How long a page waits for the server before the stored one opens instead. */
const PAGE_WAIT_MS = 3000;

/** The app's page, only if it really is one: a signed-out visit is redirected
 *  to the sign-in screen, and that must never be stored as the games. */
async function fetchShell() {
  const res = await fetch(SCOPE, { credentials: "same-origin", cache: "no-store" });
  const html = (res.headers.get("content-type") ?? "").includes("text/html");
  if (!res.ok || res.redirected || !html) throw new Error("The games page did not answer");
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.put(SCOPE, await fetchShell());
    await cache.addAll(FILES.map((file) => SCOPE + file));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/** A page: the server's when it answers in time (so a release, or the sign-in
 *  screen, shows at once), the stored one when it does not. */
async function page(request) {
  const stored = await caches.match(SCOPE, { cacheName: CACHE });
  if (!stored) return fetch(request);
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), PAGE_WAIT_MS);
  try {
    const res = await fetch(request, { signal: control.signal });
    if (res.status >= 500) throw new Error("The games server is down");
    return res;
  } catch {
    return stored;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.startsWith(`${SCOPE}api/`)) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  // Built files are content-hashed: a stored one is never stale.
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit ?? fetch(request)));
});
