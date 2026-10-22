# isputnik.games

Family games for [isputnik.home](https://github.com/isputnikdotnet/isputnik.home),
in a project and container of their own. The first game is **Dots** (Точки): two
players take turns placing dots on a grid, and a closed chain of your dots around
the other side's dots captures them.

> **Alpha.** Two on one screen, against the computer, and online between family
> members (invite, accept, play from any device; the page polls for the other
> side's moves).

## How it fits together

The games container never faces the network. The home app proxies `/games/*` to
it over the Docker network and forwards who is signed in, so the family signs in
once, in isputnik.home, and every control it has (two-factor, trusted networks,
rate limits) applies to the games too. The full design and the contract between
the two projects is in [docs/plan.md](docs/plan.md).

```
browser ──► isputnik.home (:4000) ──► isputnik.games (:4200, internal only)
```

## Running it

With Docker, beside the home app — see [`docker-compose.yml`](docker-compose.yml).
Generate one secret (`openssl rand -hex 32`) and set it as `GAMES_GATEWAY_SECRET`
on the home container and `GATEWAY_SECRET` on this one; point the home container's
`GAMES_URL` at this container. A "Games" entry then appears in the home app.

**The two containers must share a user-defined Docker network.** The home
container reaches this one by name (`http://isputnik-games:4200`), and names
resolve only on a network you created — Docker's default `bridge` has no DNS
between containers. Compose makes such a network for every project, so the
compose file above needs nothing more. With plain `docker run`, or on Unraid,
create it once and start both containers on it:

```bash
docker network create isputnik
```

**Unraid** — the repository carries a Community Applications template,
[`isputnik-games.xml`](isputnik-games.xml). It publishes no port, maps `/config`
to `/mnt/user/appdata/isputnik-games`, runs as `99:100` to match a default
appdata share, and asks for the gateway secret. Set its Network Type to the
network above, and the same on the isputnik container (edit it, change Network
Type, apply); then fill the isputnik container's `Games URL` and `Games Gateway
Secret` fields. Containers on a user-defined network are still published to the
LAN on whatever ports they map, so the home app's port works as before.

| Variable | Default | What it does |
|---|---|---|
| `GATEWAY_SECRET` | unset | The secret the home gateway signs forwarded requests with. Required in the image, at least 32 characters (`openssl rand -hex 32`); without one, with a short one, or with the compose example's placeholder the server refuses to start. |
| `PORT` | `4200` | The port to listen on. |
| `HOST` | `0.0.0.0` in the image, `127.0.0.1` from source | The address to listen on. |
| `STATIC_PATH` | `/app/web` in the image | The built web app, served under `/games/`. |
| `DB_PATH` | `/config/games.sqlite` in the image, `data/games.sqlite` from source | The SQLite file with the online matches. Mount `/config` as a volume. |
| `PUID` / `PGID` | `1000` / `1000` | The user the server runs as; the entrypoint takes ownership of `/config` for it (Unraid: usually `99` / `100`). |
| `DEV_USER` | `dev:Developer:admin:en:minimalist` | Source checkouts only, with no secret set: who the server pretends is signed in (`id:name:role:lang:theme`). |
| `LOG_LEVEL` | `info` | `trace` … `silent`. At `info` every request is a line, including each poll for the other side's move; `warn` keeps only problems. |

**Logs.** The container logs to stdout as usual (`docker logs isputnik-games`),
and the home app shows the same from Control panel → Settings → Games: the
newest lines of the server log, and a table of events — who was refused at the
gateway check, who invited whom, how a match ended, which move was thrown out,
what broke — kept for 90 days in the games database. Every log line names the
member and the browser's address the home server forwarded, and carries the
home server's request id, so the two containers' logs can be read side by side.

## Developing

```
npm install
npm run dev        # engine (tsc --watch) + server on :4200 + Vite on :5174
```

Open <http://127.0.0.1:5174/games/>. With no `GATEWAY_SECRET` the server treats
every request as the developer identity, so the app runs on its own, and the
invite dialog offers a made-up family (Mum, Dad, Kid). To play an online match
against yourself, set `DEV_USER=dad:Dad:member` on a second server (another
port) or simply accept the invitation through the API. To run it
behind a real home app instead, start the home app with `GAMES_URL` pointing at
`http://127.0.0.1:4200` and a shared secret, and open `/games/` on the home app's
address.

- `npm run typecheck` — builds the engine, then typechecks the server and the web app
- `npm run lint`
- `npm test` — engine rules and AI, server identity, web pages
- `npm run build` — everything the image ships

## Layout

```
packages/engine/   pure TypeScript game rules shared by server and web
  src/game.ts        the GameDefinition every game implements
  src/registry.ts    the list of games
  src/dots/          rules, computer opponent
apps/server/       Fastify: identity from the gateway, /games/api, static web
apps/web/          React + Vite with base /games/: lobby + one page per game
```

Adding a game: a folder in `packages/engine/src/<game>/` implementing
`GameDefinition`, a line in the registry, a page under `apps/web/src/games/<game>/`
and an entry in the lobby catalog.

## Licence

AGPL-3.0-only, like isputnik.home.
