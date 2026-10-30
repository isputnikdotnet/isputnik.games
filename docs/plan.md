# Games platform plan — isputnik.games

Family games as a project of their own, signed in through isputnik.home. The first
game is Dots (Точки), the paper-and-pencil territory game: two players take turns
placing dots on a grid, and a closed chain of your dots around the opponent's dots
captures them. This page is the plan for the whole platform and the contract the two
projects keep between them; the games' own design lives in the `isputnik.games`
repository.

Status: phases 0, 1 and 2 are built (2026-10-21; phase 2 with polling, not a live
stream). Phase 3 is open.

## Why a separate project

Games share nothing with a media library except the people playing. Keeping them in
their own repository and Docker image means:

- the home app's release rhythm, test suite and security surface stay untouched — a
  game bug can never take the library down, and a library release never ships game
  code nobody asked for;
- the games can move fast and grow (more games, real-time play) without each change
  being weighed against a 4.x media server;
- the family still signs in once. isputnik.home remains the single front door,
  with every control it already has — MFA outside trusted networks, rate limits,
  auto-block, device sessions, "preview as member".

## The one decision: isputnik.home is the gateway

The session cookie is `__Host-isputnik_sid`: httpOnly, SameSite=Lax and pinned to
the exact origin, so a browser never sends it to another hostname. CSRF is a
per-origin double-submit cookie and CORS allows only `APP_URL`. A games server on
its own hostname would therefore need a single-sign-on handshake, a second session
store and logout sync — real protocol work and new attack surface for a family game.

Instead the games container never faces the network. The home server proxies
`/games/*` to it over the Docker network and, on every proxied request, validates
the session exactly as it does for its own routes, then forwards who is asking:

```
browser ──► isputnik.home (:4000) ──► isputnik.games (:4200, internal only)
             authenticate()            trusts X-Isputnik-* only with the secret
             CSRF check
             rate limit, auto-block
```

What this buys: zero new auth code anywhere, the games work wherever the home app
works (plain LAN on port 4000, Unraid, behind the owner's reverse proxy), one
hostname and one certificate, and the "Games" entry in the nav is a plain link to
`/games/`. If the games ever need to be reachable where the home app is not, a
subdomain with a token handoff is still possible later; nothing here blocks it.

## The contract (what the two projects agree on)

### Request path

Everything under `/games/` on the home origin belongs to the games app: its pages,
its static files (`/games/static/…`) and its API (`/games/api/…`). The home server
proxies the whole prefix unchanged; the games server is built with that prefix as
its base and never answers at `/`.

### Identity headers

The home gateway strips any `X-Isputnik-*` header a client sent (so nobody can
pose as the gateway from outside), then adds:

| Header | Value |
|---|---|
| `X-Isputnik-Gateway` | the shared secret (`GAMES_GATEWAY_SECRET` on the home side, `GATEWAY_SECRET` on the games side) |
| `X-Isputnik-User-Id` | the member's id (home `users.id`) |
| `X-Isputnik-User-Name` | the display name, percent-encoded UTF-8 (Russian names are not header-safe raw) |
| `X-Isputnik-User-Role` | `admin`, `member` — or `guest` for someone let in by link (see Guests) |
| `X-Isputnik-User-Lang` | the member's interface language (`en`, `ru`) |
| `X-Isputnik-User-Theme` | the member's theme (`minimalist`, `plain-dark`, `system`, …), so the games wear the same one |
| `X-Isputnik-Client-Ip` | the browser's address as the home server saw it (its `request.ip`, which honours its proxy trust), so the games log names the person's machine rather than the home container |
| `X-Isputnik-Request-Id` | the home server's id for this request, so the two servers' log lines for one request match up |
| `X-Isputnik-Guest-Match` | guests only (see Guests): the one match the identity is good for; the games server refuses a `guest` role without it |

The games server accepts these only when the secret matches; without a matching
secret the request is anonymous (401 from the API). Out of the box the games
container therefore refuses everyone, which is the right default for a service that
must only ever be spoken to by the gateway. In development, with no secret set, the
games server uses a fixed developer identity (`DEV_USER`) so it runs on its own.

### CSRF

The home server's double-submit check runs on the proxied requests too, so the games
front end echoes the home CSRF cookie (`isputnik_csrf`, `__Host-isputnik_csrf` on
HTTPS) in the `X-CSRF-Token` header on every state-changing request — the same
thing the home SPA does. The games server adds no CSRF of its own; it would be
redundant behind the gateway and wrong in development.

### "Preview as member"

An admin previewing as a member reaches the games as that member and can read
everything; writes answer 403 from the gateway, as they do everywhere else.

### Members list (phase 2)

Online play needs "invite a family member". The home app will expose one read
endpoint to the gateway for that: active members' ids, display names and avatars.
Nothing else crosses the boundary; the games app keeps its own data.

### Guests

A member may invite someone with no account to one match (see Guests, below).
The home server mints the link and creates the match on the games API in the
member's name; the guest's browser then carries a home cookie, and the gateway
forwards role `guest`, a `guest_…` id, the name the inviter typed and the
`X-Isputnik-Guest-Match` header. The games server treats a guest as a player
of that match and nobody anywhere else.

## Changes in isputnik.home (phase 0)

- `GAMES_URL` (the upstream, e.g. `http://isputnik-games:4200`) and
  `GAMES_GATEWAY_SECRET`. With `GAMES_URL` unset the gateway is off and the app
  shows no Games entry.
- `modules/games/`: a product module (not core) registering the `/games/*` proxy via
  `@fastify/http-proxy` with `authenticate` as the pre-handler and the header
  rewrite above, plus `GET /api/games/status` → `{ enabled }` for the web app.
- Web: a "Games" entry in the primary nav and the phone Media sheet, shown when the
  gateway is on. It is a plain link (full navigation), not an SPA route.
- Vite dev server proxies `/games` to the home server, like `/api`, and the
  service worker leaves `/games` navigations alone (navigateFallbackDenylist), or
  the installed PWA would answer them with the home shell.
- Documentation: configuration reference, compose example, Unraid template fields.

## isputnik.games (phase 1)

Same stack as the home app so conventions carry over: npm workspaces, Fastify,
React + Vite, Vitest, TypeScript strict, ESLint, Node 26 image on ghcr.io.

```
isputnik.games/
  packages/engine/      pure TypeScript game rules, shared by server and web
    src/game.ts           the GameDefinition interface every game implements
    src/registry.ts       the list of games
    src/dots/             rules.ts (board, captures, end), ai.ts, index.ts
    test/                 rule tests — the capture logic is where the bugs hide
  apps/server/          Fastify: identity from the gateway, /games/api, static web
  apps/web/             React + Vite with base /games/: lobby + one page per game
  Dockerfile, docker-compose.yml, .github/workflows, docs/
```

### Engine shape

Every game is a `GameDefinition<Options, State, Move>` with pure functions:
`createGame(options)`, `legalMoves(state)`, `applyMove(state, move)`, and an
optional `ai.chooseMove(state, level, random)`. State is plain JSON. The same code
runs in the browser for local and computer games and, in phase 2, on the server as
the authority for online games — so the engine never touches the DOM or Node APIs.

### Dots rules (the variant implemented)

- Board sizes 10, 15, 20, 25, 30 (intersections). Blue moves first, red second.
- A move places one dot on an empty point that lies in no territory.
- After a move, every region adjacent to the new dot that cannot reach the board
  edge through non-blue cells (4-connected flood fill, which is the same as being
  ringed by an 8-connected chain of the mover's live dots) and contains at least one
  live opponent dot becomes the mover's territory. Opponent dots inside are
  captured; empty points inside become unplayable. A ringed region with no
  opponent dot inside is not captured and stays open — the Yandex rule.
- Then the new dot is checked the other way: if it sits in a region the opponent
  had already ringed, the opponent captures that region at once (playing into a
  "house" loses the dot).
- Captured dots no longer count as chain material. Ringing a region that contains
  the opponent's territory takes it over, which frees your dots inside and captures
  theirs.
- Edge points cannot be captured, which falls out of the flood-fill definition.
- The game ends when no playable point remains or when a player reaches the
  optional capture target; the local game can also be ended by agreement. Score is
  captured dots.

### Computer opponent

Heuristic, three levels. Easy plays near the action and takes any capture on offer.
Normal looks one reply ahead: for each candidate it weighs captures gained, the
best capture the opponent could answer with, and distance to existing dots, with a
little randomness so games differ. Hard looks at more candidates, weighs the reply in full and also rewards the capture a move sets up for its own next turn, so it builds rings rather than only closing them. Candidates are points within two steps of an
existing dot, which keeps a 30×30 board under a tenth of a second per move.

### Web app

- `/games/` — lobby: one card per game in the registry.
- `/games/dots` — new game (board size, mode, who the computer plays, capture
  target) and the board: SVG grid, dots, captured areas as filled loops through their rings, last move marked,
  scores and turn, undo, end game, new game. The game in progress is kept in
  localStorage so a refresh or a phone lock does not lose it.
- Language follows the home app: the same `isputnik-language` localStorage key is
  read first (same origin), else the gateway's header, else the browser.
- Theme tokens are copied from the home app's `tokens.css` so the two look like one
  product; shared components are copied, not published, until a third consumer
  exists.

### Server

- `GET /games/api/health`, `GET /games/api/me`.
- Static serving of the web build under `/games/` with an SPA fallback for
  `/games/*` that is not `/games/api/*`.
- No database in phase 1; the server is a thin host. Phase 2 adds SQLite.
- Image: `node:26-slim`, runs as `node`, port 4200, no volume. Refuses to start in
  production without `GATEWAY_SECRET`.

## Phase 2 — online duels (built 2026-10-21)

What shipped: `matches` and `members` tables in the games server (SQLite in
`/config`), invitations (send, accept, decline, withdraw; unanswered ones expire
after 14 days), server-validated moves with an optimistic move count (a stale
client gets 409), resignation, a lobby with invitations and matches grouped by
whose move it is, and a match page that polls — every 2.5 s while the other side
is to move, every 10 s otherwise. The members list comes from the home app's
`GET /api/games/members`, called by the games front end on the home origin. Still
open from the list below: a live stream, notifications, rematch, ratings.

- SQLite (`better-sqlite3`, WAL) in `/config`: `matches`, `moves`, `invitations`,
  per-game `ratings`. Keyed by home user ids; a departed member shows as "former
  member".
- Match flow: invite a member → they accept → the server holds the authoritative
  state, validates each move with the engine, and pushes the opponent's moves live.
  Server-Sent Events first (they pass through the proxy unchanged); WebSocket if a
  game ever needs two-way streaming, with `websocket: true` on the gateway.
- A match list on the lobby, unfinished matches resumable from any device, and a
  small results history per member.
- Needs the members-list endpoint from the home app (see the contract).

## Phase A — the games in the home app (built 2026-10-22)

Decided with the owner on 2026-10-22, after Dots and online duels were playable:
how the games show up inside isputnik.home without a second notification
system. In-app alerts pull; email (phase B) will push.

- **The count.** The games server answers `GET /games/api/summary` for the
  signed-in member: invitations to answer and matches where it is their move.
  The home app asks for it through the gateway on page load, when the window
  regains focus and once a minute, and shows the total on the Games entry
  (desktop nav and the phone Media sheet). Nothing about matches is stored in
  the home database.
- **The cards.** For you lists the same facts beside "Dad wants you to read
  this": an invitation with Accept and Decline (answered on the games' own API
  through the gateway; accepting opens the board), and "Your move against …"
  with Play. Links into the games are full navigations, never routes of the SPA.
- **The admin's view.** Control panel → Settings → Games: read-only status —
  gateway on or off (and why not), the URL, whether a secret is set, whether the
  games server answers and its version (`/games/api/health`, probed from the
  home server with a short timeout). The two settings stay environment
  variables; the page names them.
- **Who sees the games is the admin's call.** A per-member "Show Games" switch
  on Profile was built and taken out again the same day: the owner wants the
  menu's sections — Audiobooks, Ebooks, Gallery, Family Tree, Stories, Games —
  switched on and off by the admin, for the whole household, on Settings →
  Appearance (4.35.0). Games is one of those six, on top of the gateway being
  configured.
- **Signing in from a games page.** A signed-out page navigation under `/games`
  (a bookmark, the installed app's icon) is answered with a redirect to
  `/login?next=…` instead of the gateway's 401; the sign-in screen remembers the
  path and returns there with a full navigation. API calls under `/games/api/`
  keep the 401, so the games front end can say "signed out".

## Logging and the admin's window (built 2026-10-22, games 0.3.0 / home 4.36.0)

A security review of the pair found the gateway sound and the games side blind:
its request log named the home container on every line, nothing recorded who
played or who was refused, and a wrong secret was silent. The fix keeps the one
trust direction the contract has — the games server never calls the home
server; the home server asks, through the gateway, on an admin's behalf.

- **Events table** in the games database: level, event, actor, match, the
  browser's address, the home request id, a line of detail. Written for
  `gateway.rejected` (a caller without a valid secret, with why but never the
  secret itself), `match.created/accepted/declined/cancelled/finished/resigned`,
  `move.illegal` (the rules refused it), `move.refused` (not your turn, the
  match moved on), `request.invalid`, `request.too_large` and `request.error`
  (a 500). Pruned after 90 days, on start and daily.
- **Two admin routes**, answered only when the forwarded role is `admin`:
  `GET /games/api/admin/events` (level and event filters, paging, the event
  names on record, and how many callers were refused in the last 24 hours) and
  `GET /games/api/admin/log`, the newest lines of the server log from an
  in-memory ring buffer (500 lines) that pino writes through on its way to
  stdout — what `docker logs` would show, without a shell on the host.
- **Backups (2026-10-25).** `GET /games/api/admin/backup` hands an admin the
  whole database as one consistent `db.serialize()` copy
  (`application/vnd.sqlite3`, `X-Isputnik-Backup-Version`), for the home
  server's full and minimal backups, which store it as `apps/games.sqlite`
  (home's `docs/apps-platform-plan.md` → Backups). A `backup.taken` event is
  written after the copy, so the copy never holds it.
- **The home app shows both** on Control panel → Apps (Events, Logs; it was
  Settings → Games until home 4.38), under the
  status it already had: a Recent events table with a level filter, and a
  Server log panel with Refresh and Copy. Nothing about them is stored in the
  home database; the page calls the games routes through the gateway.
- **Two more headers** from the gateway, under the prefix it already strips
  (see the contract): the client address and the home request id. The games
  server puts user id, address and request id on every log line (a child
  logger per request) and honours the forwarded id only when the secret
  matches.
- **Hardening that rode along**: options and moves are reduced to what the game
  reads before they are stored (`parseOptions` / `parseMove` on
  `GameDefinition`), the request body limit is 16 KiB, and the image refuses a
  secret shorter than 32 characters or the compose example's placeholder.

With the events on the home page, `LOG_LEVEL=warn` is the sensible production
setting for the games container: `info` writes a line for every poll.

**Phase B — email (next).** The games server tells the home server when an
invitation is sent, a turn passes to someone, or a match ends — one call signed
with the shared secret, so the games container needs the home server's address
(`HOME_URL`). Home decides whether to mail: a flag on Settings → Notifications,
off by default like the others, through the existing relay and templates. A turn
is reported only when the other person is not looking (their browser has not
polled the match for a couple of minutes) and at most once per turn; invitations
always go out. Per-member or per-group grants on who may play were considered
and left out for a family; the admin's section switch is the only control until
a need shows up.

## Phase 3 — more games

Each new game is a folder in `packages/engine/src/<game>/` implementing
`GameDefinition`, a page in `apps/web/src/games/<game>/`, an entry in the web
app's catalog (`games/catalog.ts`: icon, name, summary) and a line in the
registry. Everything else — identity, matches, invitations, polling — is shared.
Built: Star Battle (below). Candidates: Tic-tac-toe on a big board
(Крестики-нолики / Gomoku), Checkers (Шашки).

### Star Battle (Звёздный бой) — built 2026-10-23 as Sea Battle, in orbit since 0.5.0

The squared-paper game of hidden fleets (Морской бой), under a name of its own
(the board-game trademark is somebody else's) and, since the app is iSputnik,
set in space: each player deploys a fleet of spacecraft in a 10×10 sector of a
star chart, the single-module craft are sputniks, and the squares around a
destroyed craft are a debris field — the story behind the rule that marks them
as misses. Game id `starbattle`; it shipped one release as `seabattle`, so the
server rewrites that id in the matches table on open and the web router opens
the old address under the new id.

- **Rules**: 10×10 sector each. Fleet "classic" is 4-3-3-2-2-2-1-1-1-1 (ten ships,
  twenty decks); "small" is 3-2-2-1-1-1 for a quick game — the one option, so
  the two players share it. Craft are straight and may not touch, not even at
  a corner. A hit earns another shot; a miss passes the turn. A destroyed craft's
  surrounding squares are marked as misses for the shooter, since nothing can
  lie there. The game ends when a fleet is wholly destroyed; score is craft destroyed,
  which is what the match list shows.
- **Deploying the fleet is a move.** Seat 0 deploys first, then seat 1, then seat 0
  fires first — so the one move type, `{kind: "place", vessels}` or
  `{kind: "shoot", x, y}`, carries the whole game through the same match
  tables, move count and turn column as Dots. Placing in parallel would need a
  "both to move" turn the home app's "your move" count does not know; sequential
  is good enough for a family.
- **Hidden information.** The state holds both fleets, so the engine gained an
  optional `viewFor(state, seat)` on `GameDefinition`: the server answers every
  read and every move with the view for the asking seat, in which the other
  fleet is reduced to the craft already destroyed (`placed` still says it was laid).
  The computer opponent reads only what a player could — its own shots and the
  destroyed craft — never the other fleet. A local game keeps the whole state on the
  device; with two people on one screen a curtain goes up between turns.
- **Computer opponent.** Deploys its fleet at random. Easy fires at random and,
  once a craft is found, at any neighbour of a hit, forgetting the craft now and
  then. Normal hunts along the line and searches on the lattice the longest
  craft intact must cross, skipping squares nothing intact fits in. Hard counts,
  for every open square, the consistent placements of the craft still intact
  (no miss, no destroyed module, touching no hit it does not cover) and fires
  where the count is highest, which with a craft found becomes the placements
  through its hits. Measured over sixty random fleets: about 63, 58 and 55 shots
  to destroy a classic fleet — the four sputniks keep the levels close, as on paper.
- **Web**: `games/starbattle/` — `SectorBoard` (one sector as SVG over a
  starfield: lettered columns in the interface language, А–К in Russian, craft
  as capsules, a burst for a hit), `FleetEditor` (tray of craft, tap to deploy,
  tap to lift, rotate, Random, Clear, Ready), `StarBattleBoards` (the viewer's
  two sectors), the local page with the curtain, and the match page.
  The invite dialog became the lobby's own (`pages/InviteDialog`) with a game
  chip row and each game's settings; `GameOverDialog` moved to `shared/`.
- **Local play is against the computer only** (owner, 2026-10-23): two people
  on one screen would have to hide their fleets from each other on it, so the
  pass-the-device mode Dots has was taken out of this game. The page opens on a
  small menu; **New game** is a dialog (fleet, who fires first, level); **Exit
  game** is there from the first screen on and abandons the game after a
  confirmation; a finished game offers **New game** or **Main menu** (the lobby).
- **The arena (2026-10-23, after a mock agreed with the owner).** A Star Battle
  page wears a dark space theme on every app theme: while it is up the body
  carries `data-arena="star"` (`shared/useArena`), which dresses the page below
  the app bar — body, buttons, chips — and widens the main column to 1440px; the
  app bar and the dialogs keep the app's theme. Layout: title and the summary
  with a turn chip on the right (YOUR TURN / COMPUTER'S TURN / DEPLOYING / GAME
  OVER, and "Turn n" counted as one more per miss); the two sectors as panels
  with "n / total craft intact" and a row of pips; the Comms panel; a status bar
  with the instruction, the last event and the actions. On a phone (≤900px)
  one board shows at a time under a **battle strip** — YOUR FLEET vs ENEMY
  SECTOR, each half with its count and pips — and the shown board follows the
  turn: the enemy sector on the player's shot, their own fleet while the other
  side fires; a tap on the strip overrides that until the turn changes.
- **Comms**, the one panel every game wears (`shared/Comms`, `shared/commsLines`):
  a dark console with one line per move in the game's own words, the players'
  messages in between, and a line from the game at the end (your move, X to
  move, who won). Who is always the same two colours (you cyan, the other side
  violet, the computer too); only a result is coloured — green for a hit or a
  capture of yours, red for one against you, grey for a miss. The lines come
  from a new optional `narrate(before, move, after)` on `GameDefinition`: plain
  JSON events (Star Battle: `deploy` without squares, `fire` with the square and
  the result; Dots: `dot` with the point, what it captured, whether it was lost
  at once); the web app puts them into words. A local game narrates its move
  list incrementally (`shared/useFeed`, a WeakMap from each move object to the
  position and events reached after it); an online match gets `feed` with every
  view from the server.
- **Talk, online only.** A `match_messages` table (match, author, text, the
  move count it was said after) and `POST /games/api/matches/:id/messages`
  (120 characters, trimmed, only while playing or once finished, players only);
  `messages` ride with every match view and the panel slots each one after the
  move it was said after. The prompt sits under the log with four one-tap
  phrases (good game, nice one, your move!, rematch?). Against the computer the
  panel is a log only. No moderation beyond the length: it is a family.
- **Home side**: the cards on For you name the game (`user:games.starbattle`);
  nothing else changed there.

### Dominoes («Козёл») — planned 2026-10-23

The courtyard game, for two: «Козёл» played from a boneyard. Game id
`dominoes`. Owner decisions (2026-10-23): the «Козёл» draw game, not
Western points or All Fives; against the computer and online only (hands
are hidden, so no two-at-one-screen mode, as in Star Battle); classic ivory
tiles on a felt table that follows the app theme, with no arena. Board
styles like Chess's can come later.

- **Rules (the variant to implement).**
  - **Tiles and deal.** A double-six set, 28 tiles. Each player gets 7; the
    other 14 are the boneyard («базар»).
  - **First hand.** The player holding the lowest double leads it: 1:1, then
    2:2 … 6:6, then 0:0 last, since it is worth nothing. If neither player
    holds a double, the lowest tile leads. In each later hand, the winner of
    the hand before leads with any tile.
  - **A turn.** Play a tile that matches either open end. A double lies
    crosswise and does not branch, since there is no spinner. A player who
    cannot play draws one tile at a time until they can. With the boneyard
    empty, a stuck player passes.
  - **End of a hand.** A player who empties their hand wins it, and the other
    player adds their pips to their running total. When no tile anywhere (either
    hand or the boneyard) can match the line, the line is closed («рыба»): the
    hand ends at once, the boneyard does not count, the lower pip count wins and
    the higher hand's pips go to its holder. A lone 0:0 counts 25 when it is the last tile left in a hand.
    A «рыба» with equal pips scores nothing, and the player who made the
    last play leads the next hand.
  - **End of the game.** Whoever reaches 101 is «козёл» and loses. The other
    player wins.
  - **Options.** Target 101 (default) or 51 for a quick game. This is the one
    option, so both players share it.
  - **House rules settled (owner, 2026-10-23):** an equal-pip «рыба» scores
    nothing, the boneyard can be drawn to the last tile, and a lone 6:6
    counts its 12 pips like any other tile.
- **Moves.** `{kind: "play", tile, end: "left" | "right"}`, `{kind: "draw"}`
  and `{kind: "pass"}`.
  - A draw carries no tile: the next tile comes off the dealt order in the
    state. Stored move lists therefore never reveal what was drawn.
  - Drawing keeps the turn. The match's turn column and the home app's "your
    move" count work unchanged.
  - The end of a hand deals the next one inside the same `applyMove`.
    Nothing waits on an "OK", and the web app shows a hand summary between
    hands.
- **Randomness, the one engine change.** Up to now every game's
  `createGame(options)` was deterministic. Dominoes needs a shuffled deal
  that the other player must not be able to work out.
  - The plan: `createGame(options, seed?)`. Dominoes keeps the seed in its
    state and deals hand *n* from `seededRandom(mix(seed, n))`, so
    `applyMove` stays pure and a replay from options + moves (how
    `matches.ts` rebuilds every match) yields the same deals. The other
    games ignore the argument.
  - The seed must never travel in `options`, because the server returns
    those to both players. The server keeps it in a new
    `match_secrets(match_id, seed)` table, a `CREATE TABLE IF NOT EXISTS` in
    `schema.sql` with no column migration on `matches`. It draws the seed
    with `crypto.randomInt` when the match is created and passes it to every
    replay.
  - A local game keeps the seed in its save on the device.
- **Hidden information.** `viewFor(state, seat)` drops the seed and the
  boneyard order, and reduces the other hand to a count.
  - Finished hands are public: their revealed tiles and the pip count go into
    a `hands` history in the state, as at a real table.
  - `narrate` events are shared by both seats (the feed is built once per
    match), so they carry nothing secret: `play` (tile, end), `draw` (no
    tile), `pass`, and `hand` (winner, points, both pip counts, whether it
    was a «рыба», the totals).
  - A test plays a few hundred random games and checks that no view, event or
    stored move names a tile the seat cannot see.
- **Score.** `scoreOf` is the running penalty totals. They are the reverse of
  every other game's score: lower is better.
  - The lists outside the game (lobby cards, home's For you rows) show a bare
    "12 – 54" today, which would read as the leader losing. They need an
    optional `scoreSense: "penalty"` on `GameDefinition`, shown as
    "12 / 54 of 101" or with the leader marked.
  - To decide while building: the lobby only, or home's rows too.
- **Computer opponent** (in the browser, local games only). It sees what a
  player sees: its hand, the line, the counts, and which numbers the other
  player was seen to lack. A draw or a pass on ends *a* and *b* proves the
  other hand holds neither number.
  - **Easy**: any legal tile, heaviest first now and then.
  - **Normal**: a heuristic. Shed pips (doubles and heavy tiles early), keep
    a spread of numbers in hand, and prefer ends the other player is known
    to lack.
  - **Hard**: sampling. Deal the unseen tiles into hands consistent with
    what was learned, play each candidate out a few plies with the normal
    policy, and keep the best average. The budget is about 150 ms, like
    Chess.
  - Measure the levels against each other over a few hundred hands before
    calling them done, as Star Battle did.
  - **Built 2026-10-23** (`dominoes/ai.ts`). What a seat is known to lack is
    public state (`lacks`): a pass on ends a and b adds them, a draw makes it
    exactly {a, b} (the tile that finally fits is played at once, so what stays
    holds neither). Hard plays 48 sampled worlds per candidate to the end of the
    hand, with ±200 for a hand that would reach the target. Over 200 games to
    101, seats alternating: normal beat easy 83% (64% of hands), hard beat
    normal 76% (60%), hard beat easy 97% (71%). Hard's slowest move was 40 ms on
    the desktop.
- **Web.** The folder is `games/dominoes/`.
  - **`DominoTile`.** An SVG tile with pips, ivory on every theme. It comes
    face up, face down, or as the selected / playable / dimmed state.
  - **`DominoLine`.** The line of play, laid out from the lead tile and
    snaking at the table's edges, with doubles crosswise. The layout is a
    pure function from the tile list and the board size to positions, so it
    has its own unit tests. It scales down as the line grows; 28 tiles is
    the most it ever holds.
  - **`DominoesTable`.** Shared by the local page and the match page, on
    `GameStage`. The felt board shows the other hand face down along the top,
    the boneyard pile with its count, and the player's hand along the bottom.
  - **Playing a tile.** A tap selects a tile and lights the ends it fits. If
    it fits only one end it plays at once; if it fits both, a tap on the
    lit end plays it.
  - **Draw and Pass** appear only when they are the legal moves. Drag and drop
    can come later, as in Chess.
  - **The panel.** The two totals as bars towards 101 (the «козёл» meter),
    then the hand number, Comms and actions.
  - **Hand summary dialog.** Both hands revealed, the pips, who collects
    them, and the new totals. «Рыба» gets its own line.
  - **Phone.** The hand becomes a horizontally scrolling row under the
    board.
  - **Shell.** The page opens on a menu with **New game** as a dialog
    (target, who leads, level), and **Exit game** is there throughout, as in
    Star Battle.
  - **Comms lines**: "You played 6:4 on the right", "Computer drew 3" (runs
    of draws fold into one line), "Fish! 23 v 31", "Hand 3: you went out,
    Computer collects 17 (54)". A tile-click cue goes into `shared/sound.ts`.
  - **Catalog.** An entry with modes `computer` and `online`, `newUntil`, and
    a lobby preview in `games/previews.tsx`. Lucide has no domino icon, so
    either use `RectangleVertical` or let `CatalogEntry.icon` take a small
    custom SVG.
  - **Locales.** A `dominoes.*` section in en and ru. In Russian the game is
    «Домино (Козёл)», and «рыба» and «базар» stay as they are.
- **Server.** Register the game, add `match_secrets`, and pass the seed
  through `createGame` everywhere `matches.ts` replays.
  - Computer results and the family leaderboard need nothing new: the game
    `key` and `useComputerResult` are shared.
  - Guest links work for any online game.
- **Home side.** `gameName()` in `GameRows.tsx` and `user:games.dominoes` (en and
  ru), plus the penalty-score display if it reaches home's rows.
- **Order of work.**
  1. Engine: rules and the seed argument, with tests for the deal, the
     leads, the draws, «рыба», scoring, `viewFor` leaks and replay
     determinism. **Built 2026-10-23**: `packages/engine/src/dominoes/`,
     `createGame(options, seed?)` and `scoreSense` on `GameDefinition`, the game in
     the registry (creating an online match answers 400 until the server passes a
     seed), `test/dominoes-rules.test.ts`.
  2. AI: easy, normal, hard, with measurements.
  3. Web against the computer, after a mock of the table on canvas agreed
     with the owner (as for Star Battle and the game stage). **Built 2026-10-23** after the
     owner picked **A, square felt** from the mock
     (https://claude.ai/artifact/BBKbHB3T9e49bm3iexUco8): `games/dominoes/` —
     `layout.ts` (pure, tested: inside the box, no overlaps, touching halves
     match; a corner after a crosswise double keeps clear of it, and a double
     straight after a corner lies along the row), `DominoTile`, `DominoesTable`
     (felt in 1000-unit percent; the hand on the felt on a desktop, in a row
     under it on a phone), `DominoesPanel` (the «козёл» meter, the hand
     summary, the hand history), the page on `GameStage`. A finished hand
     holds the computer until the person plays on. Catalog modes are
     `computer` only until step 4: the lobby shows Invite, and the invite
     dialog a game, only for games with `online`. `useFeed` takes the seed.
     Cues: a laid tile ticks like a dot, a draw scrapes (`drawTile`), a hand
     won or lost rings like a capture.
  4. Online: `match_secrets`, the match page, the score display. **Built 2026-10-23**:
     every match gets a seed (`crypto.randomInt`) in `match_secrets`, written
     with the match in one transaction and read only by `replay()`; accepting
     an invitation now takes the first turn from the dealt game instead of
     seat 0 (the lowest double leads). The tile that must open the first hand
     (`mustLead`) is public, as a table announces it. `DominoesMatchPage`
     reuses the table, panel and summaries; a hand that ends while the page is
     open is summed up, the ones before it are not. The invite dialog offers
     Play to (101/51) and no seat. `shared/score.ts` `scoreText()` marks a
     penalty score in the lobby and the guest lobby ("12 : 54 towards 101,
     fewer leads"); home's For you rows show no score, so nothing changes there.
  5. Home: name and score.
  6. Release: games minor and home patch.

### Sputnik Catch («Лови спутник!») — planned 2026-10-23, built 2026-10-24 (steps 1–5)

The first game here for one player: a Soviet LCD handheld in the spirit of the
«Электроника ИМ-02» egg-catcher, redrawn in the iSputnik theme. Game id
`sputnik`. The owner settled it on a playable mock
(`docs/mocks/sputnik-catch-mock.html`; its sprites, rules and phone layouts
are the source for the build). Decisions (owner, 2026-10-23):

- **Our own art, not the cartoon's.** A Wolf and Hare version was drawn and
  dropped: Soyuzmultfilm's characters cannot ship in a public repo and the
  Unraid listing. In their place: robot РОБ-1 with a butterfly net, four
  station modules launching sputniks down steel rails, a little alien that
  climbs out of a crashed sputnik, and Belka the space dog at a porthole.
- **It looks like an LCD.** Every sprite is always drawn, faint (the "ghost"
  segments), and the live ones darken. Printed backdrop (modules with red
  stars, rails, Moon, stars, lunar ground) in colour under it.
- **Rules (as in the mock).**
  - The game runs in ticks. Each tick every sputnik moves one of 5 steps down
    its rail; off the end it lands in the net (+1) or crashes.
  - At most one sputnik launches per tick, so no two ever land on the same
    tick. A rail does not launch while its own last sputnik is still in its
    first two steps.
  - A crash: the alien runs off over four slow ticks, the rails clear, play
    resumes. Three aliens loose ends the game. While Belka is at the porthole
    a crash counts half an alien (the half blinks).
  - Every alien is rounded up again at 200 and 500.
  - Game A starts at 620 ms a tick with one sputnik in flight, Game B at
    460 ms with two; one more in flight per 20 points (A up to 4, B up to 5).
    The tick shortens 2.4 ms per point within each hundred and 40 ms per
    hundred, never below 210 ms.
  - The score counts to 9999 and wraps, as the real thing did.
- **Controls.** Q / A / P / L (by key position, so the Russian layout works),
  arrows to move the net, 1 / 2 for Game A / B, Space to pause. On a touch
  screen: the four red buttons, or a tap on a quarter of the screen.
- **Phone.** Held upright, the screen goes full width with Game A · Game B ·
  Pause under it and one pair of big buttons under each thumb. Sideways, the
  whole handheld is sized to the screen's height. The game pauses when the
  page is hidden and asks for a screen wake lock while a run is on.
- **Not in this version:** online play and an AI opponent (there is none to
  have). A "race" (two members on the same seed at once) is a later idea.

#### Where it sits: an arcade game is not a `GameDefinition`

Everything so far is two seats taking turns; `GameDefinition` and the match
tables are built on that. Sputnik Catch is one person against a clock, so it
gets its own small contract instead of bending the old one:

- **Engine:** `packages/engine/src/arcade/` with an `ArcadeDefinition`:
  `createRun(variant, seed)`, `tick(state, net)` (pure, returns the next state
  and the cues it caused: `step`, `catch`, `crash`, `bonus`, `over`),
  `periodOf(state)` for the next tick's length, `scoreOf(state)`. Randomness is
  `seededRandom(seed)` carried in the state, like Dominoes, so a run replays
  exactly. `ARCADE_GAMES = [sputnik]` is a list of its own: `GAMES` and
  `GAME_IDS` stay two-player, so the match routes can never be handed an
  arcade id.
- **Score is the replay.** A finished run is reported as its seed, variant and
  input log: `[tick, net]` pairs, one per change of the net. The server replays
  it through the engine and keeps the score it computes, never one the browser
  sends, which is the same rule `game_records` follows for chess. Wall-clock
  time plays no part in the rules, so the replay is exact.

#### Build steps

  1. **Engine.** `arcade/game.ts` (the contract) and `arcade/sputnik/` (rules,
     variants, the speed and count curves). Tests: a catch and a crash, a crash
     with Belka out, never two landings on one tick, the 200 and 500 pardons,
     the three-alien end, the speed floor, the wrap at 9999, and a seeded run
     replayed from its input log giving the same score.
  2. **Web — the handheld.** Routes `/games/sputnik`: `App.tsx` learns arcade
     ids beside `getGame`. `games/sputnik/`: `Handheld` (shell, buttons, both
     phone layouts by container query), `LcdScreen` (the mock's sprites as one
     SVG; segments switched by id each tick), `useArcadeRun` (the tick loop on
     `periodOf`, pause on hide, wake lock, input log), keyboard and touch
     input. The demo plays itself until Game A or B is pressed. Device best per
     variant in localStorage.
  3. **Web — sound and lobby.** New cues in `shared/sound.ts`: a square-wave
     blip per rail pitch, catch, crash (four falling notes with the alien),
     bonus, game over, start. They obey the top bar's switch; the handheld's
     «ЗВУК» lamp shows that switch rather than a second one. Catalog entry
     with a new mode `solo` (the lobby offers Play, no Invite), a preview in
     `previews.tsx`, en + ru keys.
  4. **Server — scores.** New table `arcade_scores` (id, member_id, game,
     variant, score, seed, inputs JSON, ticks, game_key, finished_at;
     UNIQUE (member_id, game_key)) in `schema.sql`, no migration. `POST
     /games/api/arcade/scores` checks the game and variant, caps the log and
     ticks, replays, stores the computed score; a resend changes nothing.
     Members only (a guest's identity is scoped to one match). Event
     `arcade.score` for the admin's log.
  5. **Leaderboard.** A Sputnik Catch board in `LobbyStats`: each member's
     best Game A and Game B, this month and all time, and "your best" on the
     handheld page from the same answer.
  6. **Release:** games minor (0.17.0). The home app needs nothing: it only
     shows invitations and your-move cards, and an arcade game makes neither.

### Torpedo Run («Торпедная атака») — built 2026-10-27

The second game for one player: an original periscope torpedo game in the
spirit of the electromechanical arcade cabinets (the Soviet «Морской бой»,
itself after Sega's Periscope). Only the general mechanics are borrowed — a
periscope view, leading a moving ship with a slow torpedo, a limited number
of torpedoes, a bonus-round threshold; the layout, art and names are our own.
Game id `torpedo`, one variant `standard`. The owner approved a mockup on a
design canvas (desktop mid-round, phone mid-round, phone round-over).

- **Rules** (`packages/engine/src/arcade/torpedo/rules.ts`). 20 ticks a
  second, all whole numbers (bearings in tenths of a degree). The field of attack is ±36° (±45° until
  2026-10-29, when the owner asked for bigger ships). Ship half-widths are
  tanker 52, cargo 38, destroyer 26, patrol 19 (owner, 2026-10-29: "too
  easy, smaller ships, longer distance"); the player turns the **sight** left and right along the
  horizon (to ±20° since 2026-10-29, ±34° before; 20°/s). The engine knows
  only bearings; how the view shows them is the web app's (below). The
  torpedo leaves from under the sight and leans the way the periscope is
  turned (owner, 2026-10-29, option C of the mock): a straight course from
  the sight's bearing to `LEAN` (75 %) more of it again on the horizon. The
  lanes are `REACH` of the way out to the horizon (near 64 %, mid 81 %, far
  93 %; the lens draws each lane that far up the sea, so the course is one
  straight line and the lanes read apart — owner, 2026-10-30), so the ships keep off under the horizon, and a torpedo crosses a lane at
  bearing × (1 + LEAN × REACH) — `courseAt()`, inverted by `aimFor()`. Three lanes:
  tanker 100 (slow, near, ~25 s to cross), cargo ship 200 (steady, mid,
  ~15 s), destroyer 300 (fast, far, ~11 s), patrol boat 500 (mid, changes
  speed every so often — a quarter of the mid lane's ships). At most one
  ship to a lane; an empty lane sends the next after a seeded wait. A
  torpedo reaches the near lane after 24 ticks, mid 38, far 56 (16, 30, 46
  before the owner asked for a longer distance); the first
  ship afloat covering its course when it gets to a lane is hit (a nearer
  ship shields a farther one). One torpedo in the water at a time, ten a round, and a round clock of
  90 s so a run without a shot still ends.
- **The bonus round continues the same run.** Reaching 1 500 in the first
  round earns one bonus round of ten more torpedoes; the score carries on, so
  a run is one replayable score and one row on the board. Between rounds the
  run waits (phase `bonus`) and ticks change nothing until fire is pressed;
  the web app stops its clock there. The bonus round earns no further one.
- **Input** is `{ turn: -1 | 0 | 1, fire: boolean }` (`turn` moves the sight), logged once per change
  as `[tick, input]`; a press of fire is one tick with `fire: true`. Cues:
  `launch`, `pass`, `hit`, `miss`, `bonus`, `roundOver`, `round`, `ship`,
  `zig`, `over`. The server needed no new code: `ARCADE_GAMES` has it.
- **Web** (`apps/web/src/games/torpedo/`, `styles/torpedo.css`). The periscope
  (bearing scale with the sight's mark, pill lens, ship silhouettes, lamp-by-lamp wake, burst, HUD with ten
  torpedo lamps, score, "bonus round at 1 500", the clock, in one row, and
  the bonus bar) keeps its own
  colours on every theme — a daytime sea under flat cream clouds with a
  paper grain, after the owner's print-style mock (2026-10-29; it was dusk); the panel and round-over card follow the theme.
  **The view turns** (owner, 2026-10-29, choosing B of
  `docs/mocks/torpedo-periscope-mock.html` after the old cabinet's GIF; it
  held still with a moving sight from 2026-10-27): the lens shows ±24°
  (a phone's deep lens ±30°) with the sight always in its middle, between
  two fine etched lines — no target line; the torpedo leaves from the foot
  of the lens between them — and the scene and the bearing
  scale move past as the periscope turns, so a ship off to the side is out
  of sight. A deep lens puts the horizon in its upper part and spreads the
  lanes down it so the torpedo's course stays straight. A hit puts the sea
  in shadow for a moment and the fire throws a column of light down the
  water. A gyro dial at the tube (owner asked for a military-looking
  direction indicator, 2026-10-29) shows the course a torpedo would take: a
  graduated half-ring, a needle and running chevrons, the course in degrees
  and a tube lamp, green ready, amber while a torpedo runs.
  Space fires, ← → (or A D) move the sight, P pauses; on a phone, drag the
  lens to turn the periscope or hold the arrows, and the round
  FIRE. A phone held upright gives the lens its height (owner, 2026-10-29):
  the page title is hidden, the bearing scale sits inside the lens, the HUD
  drops its labels, and pause and full screen ride on the lens's foot as
  icons (`tools`). The clock keeps to wall time and plays
  missed ticks when a timer comes late. The card holds fire for 1.2 s so a
  player still pressing fire reads it. Sounds are synthesised cues in
  `shared/sound.ts`, under the top bar's switch. The lobby's arcade board
  became "Arcade" with three chips: Sputnik Catch A, B and Torpedo Run.
- **Later, not now:** a dusk / night / day scene picker like Chess's themes.

## Guests — playing by link (built 2026-10-23)

A member can invite someone with no account here — a friend, a cousin abroad —
to one online match. Decided with the owner on 2026-10-23; the member-to-member
flow is unchanged.

- **The link.** In the invite dialog, "Who" has one more chip beside the
  family: *Someone outside the family*, with a box for their name (the member
  types it: the match reads "vs Alex" from the start, and nothing is typed by an
  anonymous visitor on an internet-facing path). One call to the home server,
  `POST /api/games/guest-invites {game, options, seat, guestName}`, mints the
  row (`games_guest_invites`: a 32-character token kept only as its sha256, a
  `guest_…` id of the home server's choosing, 14 days to live — the games'
  own invitation lifetime), creates the match on the games API in the member's
  own name with the same signed headers the gateway would add (home → games is
  the contract's trust direction; `probeGamesServer` already calls that API),
  binds the match id to the row, and hands back `${APP_URL}/games/guest/<token>`
  once. If the games server refuses, the row is discarded and its answer
  forwarded.
- **Opening it.** `GET /games/guest/:token` is a route of the home server (a
  parametric route beats the proxy's wildcard), needing no session and
  rate-limited (10 a minute, like minting): a live token sets an httpOnly,
  SameSite=Lax guest cookie (`isputnik_guest`, `__Host-` on HTTPS) that
  expires with the link, counts the open, and redirects to
  `/games/<game>/m/<matchId>`. The link works until it expires or is revoked —
  a match lasts days and the guest comes back — but the token leaves the URL
  at once. A browser that already holds a session is sent to the match as the
  member it is, and never gets the cookie.
- **The gateway.** A session cookie always wins (a member's own session over a
  guest link opened in the same browser). Without one, a guest cookie is
  resolved — not revoked, not expired, bound to a match, the inviter still
  active — and the gateway forwards role `guest`, the `guest_…` id, the name
  the inviter typed, the inviter's language, theme `system`, and
  `X-Isputnik-Guest-Match` naming the one match. With a dead guest cookie a
  page navigation gets a small server-rendered "this game link no longer works"
  page (in the browser's language), not the sign-in screen, and the API a 401
  with `guest: true` so the games front end stops polling. The cookie is left
  in place — it expires with the link and a new link overwrites it — so every
  page the guest opens keeps explaining instead of falling through to sign-in.
- **In the games.** `guest` is a role in `identity.ts`, accepted only with a
  well-formed guest-match header and a guest-prefixed id (a member id under
  that prefix, or a guest without a match, is nobody). A guest's `/matches`
  and `/summary` hold that match alone; every `/matches/:id/*` route answers
  403 for any other id and records `guest.refused`; inviting and the admin
  routes are 403. The members roster is a home route behind a member session,
  so a guest never sees other members' names. `players[].guest` marks the
  guest in summaries. Web: the lobby route renders a one-match page for a
  guest ("You are playing as Мама's guest"), the frame hides "Back to
  iSputnik" and the phone tabs and reads "Alex · guest"; the match pages are
  unchanged — the guest accepts the invitation there like anyone, and "All
  games" lands on their one-match page.
- **Renew and revoke.** The inviter sees a **Guest link** panel on the match
  page (`shared/GuestLinkPanel`): not opened yet / opened n times and when,
  until when it works, **New link** (a fresh token and a fresh fortnight; the
  old link dies at once, the guest id and the match stay — the retired hash
  is kept so a guest clicking the old link is told, not counted as a guesser)
  and **Revoke link** behind a confirmation. The admin sees every outstanding
  link on Control panel → Settings → Games (**Guest links**: guest, game,
  who invited, expires, opened, last seen, Revoke). Rows that are over are
  swept after 30 days; a row that never got its match after 10 minutes.
- **Security.** ~190-bit tokens hashed at rest and shown once; expiry,
  renewal and revocation instead of any new blocklist machinery; an unknown
  token on the open route counts as an abuse hit (`flagAbusiveRequest`,
  "token"), so the existing per-IP auto-block covers guessing, while an
  expired or renewed link is not counted; every `X-Isputnik-*` header the
  client sends is still stripped (the new one shares the prefix); CSRF is
  unchanged — the guest's browser gets the double-submit cookie on first
  contact and the games front end echoes it as before. Audit: home
  `activity_logs` carry `games.guest_invite.created / opened / renewed /
  revoked` (the member as actor, the guest's address on "opened"), on
  Control panel → Activity; the games events name the guest as one
  ("invited Alex (guest_…, a guest)") and add `guest.refused`.

## The phone tab bar and the version (2026-10-23)

On a phone (≤740px) the games app has a bottom tab bar like the home app's,
so switching between the two apps feels like one: **Home** (back to iSputnik,
a full navigation), **Games** (the lobby; lit on the lobby and on a game's
page) and **Matches** (the lobby's online section, lit on a match page, with a
badge of invitations plus your-move matches from `/games/api/summary`,
refreshed on load, on focus and once a minute). The top bar's back link hides
at that width. The lobby's foot names the games app's version and stage.

## Open points

- Whether local (same-device) results should be recorded at all, or only online
  matches. Starting with online only.
- Where the Games entry sits in the home nav once there are several sections; for
  now it is one item after Stories.
- The Yandex game's exact edge cases (overlapping enclosures, scoring nested
  territories) are not published; the variant above is the common computer one.

### Checkers (Русские шашки) — built 2026-10-29

Russian draughts on an 8×8 board, id `checkers`, with twelve men each and White
moving first. Men move forward and capture in both directions; kings fly along
open diagonals. Captures are mandatory, with a choice of any complete sequence.
A man is crowned immediately upon reaching the far rank, even in a capture;
captured pieces remain blockers until the sequence ends. Rules reference:
https://fmjd64.org/rules-of-the-game/ (sections 3, 4 and 7).

- Engine: `packages/engine/src/checkers/`. Pure, immutable moves encoded as a
  path including the origin and every landing. The server validates complete
  paths through the shared registry. Losing all moves loses the game. Draws
  include repetition, quiet king moves and material-dependent ending limits.
- Computer: easy chooses randomly; normal and hard search with alpha-beta
  pruning, material, promotion progress and central control, under a node budget.
- Web: `/games/checkers`, with computer and two-player local games, replay-based
  save/resume, undo, resignation and an agreed draw for local players. Online
  invitations, guest links, move validation, polling and chat reuse the platform.
- Presentation follows Chess: shared board theme variables and theme picker,
  setup choices, player strips, GameStage, Comms, sounds and GameOverDialog.
  Tap successive highlighted destinations to choose a multi-capture path.
  Computer games face the human; local games turn to face the side to move.
- English and Russian labels, a lobby preview, and computer result reporting
  integrate with the existing catalog and family statistics.

### Crossmath (Числовой кроссворд) — built 2026-10-29

A crossword of sums for one player, id `crossmath`. An n × n grid of numbers in
which every row and every column is an equation with its operators and total
printed; some numbers are given (shaded), the rest are filled from a fixed tile
bank, each tile once (two 5s are two tiles). Mock: `docs/mocks/crossmath-mock.html`.

- One reading everywhere: × and ÷ before + and −, then left to right; every
  step a whole number (no remainder, nothing below zero). Printed in How to play.
- Solved when every square is filled and every line works out. The validator
  checks the equations, not the stored solution.
- Every shipped puzzle has exactly one solution: `crossmath/generate.ts` deals a
  seeded grid, then takes givens away while `crossmath/solver.ts` (backtracking,
  a line checked as it fills and looked ahead at when one square is left) still
  counts one. So Hint can lean on the stored solution: it first flags a misplaced
  tile, then lays one correct tile (marked with an amber dot).
- The set is built ahead of time, never in the browser:
  `npm run build -w packages/engine && node scripts/build-crossmath-set.mjs`
  writes `crossmath/set.ts` (easy 60 · medium 60 · hard 50 · expert 40). Easy
  No. 1 is the proposal's sample. The engine tests recheck every puzzle and that
  the generator still makes the set.
- Levels: easy 3 × 3 (+ −), medium 4 × 4 (+ − ×), hard 5 × 5 (all four), expert
  6 × 6 (all four).
- Registry: neither a `GameDefinition` (no seats) nor an arcade game (no clock
  of record): `SOLO_GAMES` in `packages/engine/src/solo.ts`, lobby mode
  "Puzzle". Tiles in play, the open level and puzzle, and the clock switch live
  in this device's storage; a solve goes to the server (below).
- Tracking (`apps/server/src/crossmath.ts`, table `crossmath_results`): the page
  sends the finished tiles, the seconds and the hints; the tiles are checked
  through the rules. The first solve of a puzzle moves the member's rating and
  is kept; solving it again is practice and can only better its best time. The
  clock always counts while the puzzle is open and in view (the switch only hides
  it), and a hint counts even if its tile is taken back. A solve that could not
  be sent goes when the page next opens; a guest's stay on their device.
- Rating (`crossmath/rating.ts`, numbers to tune): starts at 800, each level is an
  opponent of a fixed rating (800 · 1100 · 1400 · 1700), a solve scores 1 inside
  par (60 s · 3 · 7 · 15 min), falling to ½ at three times par, times the share
  of squares filled without a hint.
- What comes next: a level opens on its next unsolved puzzle and Next puzzle
  steps over solved ones (any device's); the arrows still go back to one. Three
  first solves in a row at a level scoring ¾ or better offer the next level under
  the solved notice, beside Next puzzle; a finished level offers it instead.
- Web: `/games/crossmath` on GameStage, paper on every theme. Tap a tile then a
  square, or a square then a tile; tap a placed tile to send it back. Undo
  (Ctrl+Z), Hint, Check (tells empty squares from wrong lines), Restart with a
  confirmation. A clock that can be hidden; sound through the top bar's switch. The board is
  a grid of buttons with arrow-key movement, digits to lay a tile and each square
  described by its row's and column's equations.
- Not yet: a daily puzzle picked by date, and a family leaderboard tab.
