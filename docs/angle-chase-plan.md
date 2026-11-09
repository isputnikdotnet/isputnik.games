# Angle Chase («Найди угол») — plan, 2026-11-09

A geometry puzzle for one player, id `angles`: a figure with a few angles
printed and one marked `?`. The player finds the missing angle by chaining
theorems — parallel lines, triangles, polygons, circles — and, to score in
full, proves it: names each intermediate angle and the theorem that gives it.
The levels follow a 10th-grade geometry course chapter by chapter, so the
puzzle of the week is the chapter of the week.

Why this game: Crossmath already gives the platform a solo-puzzle shape
(a pre-built set with one answer each, a device-side page, a server-checked
solve, levels, a rating) and Angle Chase reuses all of it. What is new is the
engine: a figure model, a library of angle theorems and a solver that derives
every angle with its justification. The solver is the game — it generates the
puzzles, checks the proofs and writes the hints.

Companion ideas, not in this plan: compass-and-straightedge constructions
(the stronger "real game", needs a geometric kernel of line, circle and their
intersections; after this), and a drag-the-cards proof builder (folded into
Prove it here rather than shipped on its own).

## What the player sees

- **The figure.** Drawn to scale from real coordinates, on paper like
  Crossmath, on every theme. Points lettered A, B, C…; given angles printed in
  degrees inside their arcs; the wanted angle marked `?`; equal sides with tick
  marks, parallel lines with arrowheads, right angles with a square, circles
  with their centre dotted. Unlike a textbook figure it is never "not to
  scale": what looks equal is equal, so the picture never lies — and measuring
  it gets you the answer but not the proof.
- **Answer.** A number pad (phone) or the keyboard: whole degrees. A wrong
  answer shakes and counts a try; the right one marks the puzzle solved and
  opens Prove it.
- **Prove it.** Tap an angle on the figure (every angle is a hit area and a
  button), type its value, pick the theorem from the chip row (the chips show
  only theorems the figure can use, so the row stays short — 5 to 9 chips).
  The engine checks the step against what is known so far: the givens plus
  the steps already proved. A step that holds is drawn into the figure (the
  angle fills in, the theorem's parts flash: the two parallel lines, the
  triangle, the arc); one that doesn't shakes and says why in one line ("These
  lines are not parallel", "That is 180° − 70°, not 110°"). The proof is done
  when the `?` angle is a proved step. Steps can be taken back (Undo).
- **Hints**, each counted: first the next angle that can be found flashes;
  then its theorem is named; then its value is filled in. In Answer mode the
  same three hints run on the hidden chain.
- **Clock**, hideable like Crossmath's, always counting while the puzzle is in
  view. Sound through the top bar's switch.
- **Levels** (chapters), each a card with solved · proved · best time:

  | Level | Chapter | Theorems in play | Steps |
  |---|---|---|---|
  | lines | Lines and angles | angles on a line, round a point, vertical angles, parallel lines (corresponding, alternate interior, alternate exterior, same-side interior) | 1–2 |
  | triangles | Triangles | + triangle sum, exterior angle, isosceles base angles (and converse), equilateral, right triangle acute angles | 2–3 |
  | polygons | Polygons | + quadrilateral sum, polygon sum (n − 2) · 180°, regular polygon, parallelogram (opposite equal, consecutive supplementary), trapezoid, kite | 2–4 |
  | circles | Circles | + central angle, inscribed angle (half the arc, equal on the same arc, right angle in a semicircle), cyclic quadrilateral, tangent ⟂ radius, tangent–chord, two tangents from a point, radii make an isosceles triangle | 2–4 |
  | mixed | Everything | all of the above, longer chains | 4–6 |

  Set sizes to start: 60 · 60 · 60 · 60 · 40, built ahead of time like
  Crossmath's. Lengths (Pythagoras, similar triangles) and trigonometry are
  not angles and stay out — a later "sides" level is an open point below.

- **Daily puzzle.** One mixed-level figure a day, the same for the family
  (picked from the set by the date). The lobby card shows it with who has
  solved it today; this is the piece that gets a parent and a 15-year-old
  racing. Crossmath's card gets the same treatment from the same code.

## Engine (`packages/engine/src/angles/`)

- **Figure model** (`figure.ts`). Points with coordinates (for drawing only —
  the rules never read them), and facts: `line(A, B, C…)` (collinear, in
  order), `parallel(AB, CD)`, `equal(AB, AC)`, `circle(O, [A, B, C…])`,
  `tangent(PA, O at A)`, `right(ABC)`, plus the given angles and the target.
  An angle is named by three points, `ABC` at B, as in class. Angles are
  whole degrees.
- **Theorem library** (`theorems.ts`). Each theorem is a pure rule: the facts
  it needs, the known angles it takes, the angle it yields, and an `explain`
  for the proof line and the hint. Named with the textbook's names in en and
  ru (`angles.theorem.<id>`), the same list the chips show. About 25 to start
  (the table above).
- **Solver** (`solve.ts`). Forward chaining: from the givens, apply every
  theorem that can fire until nothing new appears; the result is every
  derivable angle with the shortest chain to it. Used three ways: by the
  generator (is the target derivable, is each given needed), by the checker
  (does this step hold from what is known), by hints (the next angle on the
  shortest chain to the target).
- **Checker** (`check.ts`). `checkAnswer(puzzle, degrees)` and
  `checkStep(puzzle, known, step)` where a step is `{ angle, degrees, theorem }`.
  A step holds when that theorem, applied to the figure's facts and the known
  angles, yields that angle at that value. Any valid chain is accepted, not only
  the generator's — a student's proof may take another road, and often does.
  `checkProof(puzzle, steps)` runs the steps in order and is what the server
  calls.
- **Generator** (`generate.ts`). Template families per level, each a small
  constructive recipe that takes random whole-degree parameters and places
  points so the figure holds exactly (a triangle from two angles; a
  transversal across two parallels at an angle; a cyclic quadrilateral from
  four points on a circle at chosen arcs; tangents from an outside point).
  Then: compute every angle, choose a target, keep a minimal set of givens
  (remove givens while the solver still reaches the target; every remaining
  given must be needed), and reject the figure when any printed or wanted
  angle is under 15° or over 165°, when two labels would collide, or when the
  chain is shorter or longer than the level's range. The chain's length and
  its theorems set the puzzle's place in the level (easiest first).
- **Set** (`set.ts`), written by `scripts/build-angles-set.mjs` after
  `npm run build -w packages/engine`, like Crossmath's. Engine tests recheck
  every shipped puzzle: the target is derivable, every given is needed, the
  figure is not degenerate, the coordinates agree with the stated angles to
  within a tenth of a degree, and the generator still makes the set from its
  seeds.
- **Rating** (`rating.ts`): Crossmath's shape — a level is an opponent of a
  fixed rating (800 · 1000 · 1200 · 1400 · 1700), a solve scores from 1 down:
  time against par (90 s · 2 · 3 · 4 · 8 min, half lost by three times par),
  hints take their share, wrong tries cost a tenth each (at most three), and a
  solve **without a proof is capped at 0.7**. `WELL_SCORE` stays 0.75, so the
  next level is only ever offered to someone who proves — the proof is the
  lesson, the number is the bait. Numbers to tune once played.
- **Registry.** `SOLO_GAMES` gains `angles` (`solo.ts`), lobby mode "Puzzle".
  `GAMES`, `GAME_IDS` and `ARCADE_GAMES` are untouched.

## Web (`apps/web/src/games/angles/`)

- Route `/games/angles` on GameStage, like Crossmath; `App.tsx` adds the id.
- `Figure.tsx`: the SVG. Angles as `<path>` arcs with a wider invisible wedge
  as the hit area; each is a `shared/Button` `bare` with an aria-label
  ("Angle ABC at B, 70°" / "…, unknown"); arrow keys move between angles,
  Enter opens the value pad. Marks (ticks, arrows, squares, centre dots) are
  drawn from the facts, never hand-placed. Labels placed by a small
  collision pass at render time.
- `AnglesPage.tsx`: level cards → puzzle view (figure, number pad, Answer /
  Prove it, Undo, Hint, Restart with confirmation, the clock) → solved notice
  with Next puzzle and, after three well solves in a row, the next level —
  Crossmath's flow. Proof steps in play, the open level and puzzle, and the
  clock switch live in device storage (`storage.ts`); a solve that could not be
  sent goes when the page next opens.
- Phone: the figure full width, the chip row scrolls sideways, the number pad
  under the thumb; landscape puts the pad beside the figure.
- Catalog entry, preview in `previews.tsx` (a triangle with a transversal and
  a `?`), How to play with the theorem list as a reference card (the names and
  one-line statements — a cheat sheet the player can read mid-puzzle without
  it counting as a hint), en + ru keys.

## Server (`apps/server/src/angles.ts`)

- Table `angles_results` in `schema.sql` (no migration): Crossmath's columns
  (member, puzzle id `lines-12`, level, hints, seconds, best_seconds, rating
  before and after, finished_at, UNIQUE member + puzzle) plus `tries`,
  `proved INTEGER NOT NULL DEFAULT 0` and `proof TEXT` (the steps, JSON, kept
  so a parent can read it on the family board).
- `POST /games/api/angles/:id/result` with `{ degrees, tries, hints, seconds,
  steps }`: the answer is checked through the engine, the steps through
  `checkProof`; a proof that does not hold is refused outright (the browser
  already checked it, so this is a tamper check, not a user error). First solve
  moves the rating and is kept; a later solve that adds a proof to an
  unproved puzzle is recorded too (the rating moves by the difference, once);
  anything after is practice and can only better the best time.
- `GET /games/api/angles/me`: rating, played, per level solved · proved ·
  count · best · ready, per puzzle solve. Same shape as `CrossmathMe`.
- Daily: `GET /games/api/puzzles/daily` answers for both puzzles —
  `{ date, angles: { id, solvers: [{ member, seconds, proved }] }, crossmath: {…} }`;
  the id is the set index from a hash of the date, and the solvers are read
  from the results tables by `finished_at` on that date. Members only; a guest
  sees the puzzle, not the board.
- Events `angles.solve` for the admin's log in the home app (which already
  tails this log through the gateway; nothing to add there).

## Build steps

  0. **Mock** (`docs/mocks/angle-chase-mock.html`): a playable figure from
     each of the lines, triangles and circles levels with the pad, chip row
     and a proof in progress, desktop and phone. The owner settles on it
     before the build; its theorem names and layouts are the source.
  1. **Engine — model, theorems, solver, checker.** Tests: each theorem on a
     hand-built figure; a chain through parallels and a triangle; a cyclic
     quadrilateral; a step refused for a wrong theorem and for a wrong value;
     an alternative valid proof accepted.
  2. **Engine — generator and set.** Templates per level, the degeneracy and
     label checks, the build script, the shipped set, the recheck tests.
  3. **Web — the page.** Figure, pad, Answer, Prove it, hints, clock, storage,
     catalog, preview, How to play, en + ru.
  4. **Server — results and rating.** Table, routes, the rating maths from the
     engine, the event.
  5. **Daily puzzle and the family board**, for Angle Chase and Crossmath
     together: the route, the lobby card, a Daily tab in `LobbyStats`.
  6. **Release:** games minor (0.26.0). The home app needs nothing: a puzzle
     makes no invitations and no your-move cards.

## Open points

- **A sides level** (Pythagoras, similar triangles, trig ratios): the same
  chain idea with lengths instead of angles, square roots and rounding make
  the answer check fuzzier; decide after the angle levels have been played.
- **Teacher's order.** Schools differ in the order of chapters (circles before
  or after polygons). Levels are all open from the start, so the order of the
  cards is only a suggestion; a per-member "current chapter" pin is not worth
  a setting.
- **Constructions** as the next geometry game — a plan of its own once this is
  played.
- **TV.** Not in this version: typing degrees with a remote is poor. A
  four-choice version of the daily puzzle could suit the TV later.
