# Publishing a companion container

How isputnik.games became a public image and an Unraid Community Applications
(CA) listing, written down so isputnik.video and isputnik.faces can follow the
same steps. isputnik.home went first (2026-10-23); games followed on
2026-11-09. Everything here is in the companion's own repository unless it
says otherwise.

## 1. The image

- `Dockerfile` at the repository root; the image runs unprivileged behind a
  `PUID`/`PGID` entrypoint, carries its health check, and a
  `net.unraid.docker.icon` label pointing at the icon URL below, so a container
  whose saved template lost its icon still draws one.
- `.github/workflows/docker.yml` builds on every push and pull request and
  publishes to `ghcr.io/isputnikdotnet/<repo>` only on an annotated `v*` tag,
  after `test.yml` (typecheck, lint, every suite) has passed. The package must
  be **public** on GitHub (Packages, package settings, Change visibility); the
  first publish of a new package is private, and a private image fails every
  install.
- Check it from outside before listing it: an anonymous token from
  `https://ghcr.io/token?scope=repository:isputnikdotnet/<repo>:pull` must get
  `200` for `GET /v2/isputnikdotnet/<repo>/manifests/latest`, and
  `gh api users/isputnikdotnet/packages/container/<repo>` must say
  `"visibility": "public"`.
- Release: bump every `package.json` (root, each workspace, and the workspace
  pins of each other) and `npm install --package-lock-only`; `npx eslint .`,
  `npm run typecheck`, `npm test`; commit `release: X.Y.Z - <what>` with explicit
  paths; **then** in a separate call tag `vX.Y.Z` (annotated) and push main and
  the tag. `gh run list --workflow docker.yml` shows that the build started; the
  tag's build is the only one that publishes. A tag whose build failed stays
  with no image: fix on main and release a patch rather than moving the tag.
  Look at the previous tag's run before releasing: v0.25.0 of games failed on a
  typecheck error in a web test and `latest` stayed at 0.24.1 for three days
  without anyone noticing.

## 2. The template and the profile

Two XML files at the repository root, modelled on isputnik.home's
`isputnik-home.xml` and `ca_profile.xml`:

- `isputnik-<name>.xml`, the CA install template. `<Name>` is the container
  name CA lists it under (`isputnik-games`); never rename it, existing installs
  are keyed on it. `<Repository>` pins `:latest`. `<TemplateURL>` and `<Icon>`
  are raw GitHub URLs to `main`; the icon lives in `Assets/brand/` at the root
  (a 512 x 512 PNG; Unraid does not draw an SVG). `<Overview>` says the
  container is an add-on installed beside the isputnik container and how the
  two are paired; `<Requires>` names isputnik.home and the first version with
  Settings, Apps (4.38).
- Settings: a companion keeps the smallest possible set. `GATEWAY_SECRET`
  (required, masked), the appdata path, the port, and PUID/PGID and the log
  level as advanced. Nothing else: the address, who may use it and from where,
  and every product setting live in isputnik.home. An engine with media adds
  its read-only `/media` path and, for video, the optional `/dev/dri` device
  and `/transcode` path.
- Network: `bridge` with the container's port published (4200 games, 4300
  video, 4400 faces). That works for every Unraid install: home reaches the
  companion at `http://<unraid IP>:<port>`; a user-defined network or br0 with
  a fixed IP also works and the mapping is then unused. Publishing the port is
  safe because the companion answers 401 to anything without the secret.
- `ca_profile.xml`: a non-empty `<Profile>` paragraph, the same `<Icon>`, and
  `<WebPage>` pointing at the repository. The submission form refuses a
  repository without it.
- Validate before committing: well-formed XML (`npx -y xmllint` or a node
  parser), every URL in both files answers 200 (icon, template, project,
  support, registry page), the port matches the Dockerfile's `EXPOSE`.
  Commit and push to `main`; CA reads the files from there.

## 3. The submission

<https://ca.unraid.net/submit/new>: Before you begin, Sign in (an Unraid
account; the owner's action), Add repository (the GitHub URL,
`https://github.com/isputnikdotnet/<repo>`), Review (CA scans the repository:
template, profile, LICENSE, duplicates), Submit. The repository must be public
with an OSI licence file (AGPL-3.0 here). Home was approved automatically; a
companion whose name is unique should be too. CA rebuilds its catalog from
`main`, so later edits to the template publish by themselves.

Submitting is the owner's action, not a session's: get the files ready, check
the URLs, and hand the owner the URL and the repository address.

## 4. On the isputnik.home side

- `docs/users/apps.md` describes installing each companion and pairing it; keep
  its Unraid lines true to the template (the port it publishes, the field
  names). The Help page lists the guide already; `npm run check:ui` there fails
  when a guide and the Help listing drift.
- Nothing in home's own template changes: home finds its companions through
  Settings, Apps, not through environment variables.
