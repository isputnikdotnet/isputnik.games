# isputnik.games

Family games for [isputnik.home](https://github.com/isputnikdotnet/isputnik.home),
in a project and container of their own. The first game is **Dots** (Точки): two
players take turns placing dots on a grid, and a closed chain of your dots around
the other side's dots captures them.

> **Alpha.** Local play (two on one screen, or against the computer) works. Online
> duels between family members are the next phase.

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

| Variable | Default | What it does |
|---|---|---|
| `GATEWAY_SECRET` | unset | The secret the home gateway signs forwarded requests with. Required in the image; without it the server refuses to start. |
| `PORT` | `4200` | The port to listen on. |
| `HOST` | `0.0.0.0` in the image, `127.0.0.1` from source | The address to listen on. |
| `STATIC_PATH` | `/app/web` in the image | The built web app, served under `/games/`. |
| `DEV_USER` | `dev:Developer:admin:en:minimalist` | Source checkouts only, with no secret set: who the server pretends is signed in (`id:name:role:lang:theme`). |
| `LOG_LEVEL` | `info` | `trace` … `silent`. |

## Developing

```
npm install
npm run dev        # engine (tsc --watch) + server on :4200 + Vite on :5174
```

Open <http://127.0.0.1:5174/games/>. With no `GATEWAY_SECRET` the server treats
every request as the developer identity, so the app runs on its own. To run it
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
