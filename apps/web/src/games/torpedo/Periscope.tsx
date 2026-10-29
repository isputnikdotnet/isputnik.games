import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Torpedo, type TorpedoState } from "@isputnik/games-engine";
import { SHIP_HEIGHT, SHIP_PATHS } from "./ships";
import type { TorpedoMode } from "./useTorpedoRun";
import { FIELD_W, HORIZON, K, LENS_H, SPAN, courseX, formatScore, laneYs, screenX, shipScale, tubeOf, viewOf, wakePoint } from "./view";

const { SHIPS, SINK_TICKS, RANGE, TORPEDOES, BONUS_AT, TICK_MS, inSights } = Torpedo;

/** How far the scene runs on either side of the field, for the view to turn over. */
const SEA_FROM = -400;
const SEA_TO = FIELD_W + 400;

/** Clouds in the sky, flat underneath as in an old print: [x, height above the
 *  horizon, width], in view units. The high ones only show in a deep lens. */
const CLOUDS: readonly [x: number, rise: number, width: number][] = [
  [-300, 46, 210], [-110, 70, 240], [140, 70, 250], [370, 52, 150], [700, 62, 230], [930, 78, 170], [1130, 50, 220], [1330, 72, 190],
  [-200, 160, 180], [560, 170, 200], [210, 250, 220], [830, 320, 180], [1180, 230, 200], [480, 420, 160], [-60, 380, 190]
];
/** A cloud's outline: three puffs over a flat base. */
const cloudPath = (x: number, y: number, w: number) => {
  const h = w * 0.16;
  return `M${x - w / 2} ${y} C${x - w * 0.44} ${y - h * 0.9} ${x - w * 0.3} ${y - h * 1.2} ${x - w * 0.18} ${y - h * 0.9} ` +
    `C${x - w * 0.12} ${y - h * 2} ${x + w * 0.14} ${y - h * 2.1} ${x + w * 0.2} ${y - h} ` +
    `C${x + w * 0.3} ${y - h * 1.4} ${x + w * 0.46} ${y - h * 0.8} ${x + w / 2} ${y} Z`;
};
/** Glints on the water, row by row, near rows wider apart: [x, y, width].
 *  The rows run on below a wide lens's foot for a deep one's foreground. */
const GLINTS: readonly [number, number, number][] = [
  [222, 70, 10], [252, 95, 16], [296, 130, 24], [348, 170, 34], [404, 220, 46], [470, 260, 56], [540, 300, 64],
  [620, 330, 70], [710, 360, 76], [810, 390, 82], [920, 420, 88], [1040, 450, 94], [1170, 480, 100]
].flatMap(([y, every, width], row) =>
  Array.from({ length: Math.ceil((SEA_TO - SEA_FROM) / every) + 1 }, (_, i): [number, number, number] => [SEA_FROM + i * every + ((row * 37 + i * 53) % 29) - row * 11, y + ((i * 7) % 5), width]));
/** The bearing scale: a tick every 5°, a figure every 15°, as far round as the view turns. */
const SCALE: readonly number[] = Array.from({ length: 25 }, (_, i) => -60 + i * 5);
/** One lamp of the wake every this many ticks of the torpedo's run. */
const LAMP_EVERY = 4;
const LAMP_RUNS = Array.from({ length: RANGE.far / LAMP_EVERY + 1 }, (_, i) => i * LAMP_EVERY);

/** The gyro dial's graduations, in degrees either side of straight up. */
const DIAL_TICKS = Array.from({ length: 13 }, (_, i) => -60 + i * 10);

/** The gyro dial at the foot of the lens, as on a fire-control panel: a
 *  graduated half-ring round the tube, a needle and chevrons along the course
 *  a torpedo fired now would take (from under the sight, leaning the way the
 *  periscope is turned), the course in degrees in a boxed readout, and the
 *  tube lamp — green when ready, amber while a torpedo is in the water. */
function GyroDial({ bearing, tubeY, ready, scale }: { bearing: number; tubeY: number; ready: boolean; scale: number }) {
  const r = Math.min(44, 0.32 * (tubeY - HORIZON));
  const cx = screenX(bearing);
  const cy = tubeY;
  // The course's direction on the lens: a straight line, so any two points give it.
  const far = tubeY - (tubeY - HORIZON) / 2;
  const dx = courseX(bearing, far, tubeY) - cx;
  const dy = far - cy;
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const at = (radius: number, along = 0) => [cx + ux * radius - uy * along, cy + uy * radius + ux * along];
  const polar = (degrees: number, radius: number) => {
    const a = (degrees * Math.PI) / 180;
    return [cx + Math.sin(a) * radius, cy - Math.cos(a) * radius];
  };
  const course = Math.round((bearing * (1 + Torpedo.LEAN / 100)) / 10);
  const [needleX, needleY] = at(r + 9);
  const [baseL, baseR] = [at(r - 3, -5), at(r - 3, 5)];
  const [arcL, arcR] = [polar(-64, r), polar(64, r)];
  return (
    // A deep lens shows more of the scene to a pixel: the dial is drawn larger there.
    <g className={`torpedo-gyro${ready ? " is-ready" : ""}`} transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
      <path d={`M${arcL[0]} ${arcL[1]} A${r} ${r} 0 0 1 ${arcR[0]} ${arcR[1]}`} className="is-ring" />
      {DIAL_TICKS.map((d) => {
        const major = d % 30 === 0;
        const [x1, y1] = polar(d, r);
        const [x2, y2] = polar(d, r - (major ? 8 : 4));
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? "is-major" : undefined} />;
      })}
      {ready && (
        <>
          <line x1={at(r * 0.3)[0]} y1={at(r * 0.3)[1]} x2={at(r - 3)[0]} y2={at(r - 3)[1]} className="is-needle" />
          <polygon points={`${needleX},${needleY} ${baseL[0]},${baseL[1]} ${baseR[0]},${baseR[1]}`} className="is-head" />
          {[r + 20, r + 34, r + 48].map((radius, i) => {
            const [tipX, tipY] = at(radius);
            const [lx, ly] = at(radius - 6, -6);
            const [rx, ry] = at(radius - 6, 6);
            return <polyline key={radius} points={`${lx},${ly} ${tipX},${tipY} ${rx},${ry}`} className="is-chevron" style={{ animationDelay: `${i * 0.18}s` }} />;
          })}
        </>
      )}
      <g transform={`translate(${cx + r + 10} ${cy - 22})`}>
        <rect width={44} height={17} rx={2} className="is-box" />
        <text x={22} y={12.5} textAnchor="middle" className="is-readout">{ready ? `${compass(course)}°` : "———"}</text>
        <circle cx={-4} cy={8.5} r={2.6} className="is-lamp" />
      </g>
    </g>
  );
}

/** What the lens's banner says for a moment: a hit and its points, or a miss. */
export interface Banner {
  kind: "hit" | "miss" | "bonus";
  points?: number;
  tick: number;
}
const BANNER_TICKS = 28;

/** The lens's width over its height, measured, so the view shows the sea at its true shape. */
function useAspect<T extends Element>() {
  const ref = useRef<T>(null);
  const [aspect, setAspect] = useState(1000 / LENS_H);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, aspect] as const;
}

/** A pressed control keeps no focus, so Space goes on firing rather than pressing it again. */
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

const compass = (degrees: number) => String(((degrees % 360) + 360) % 360).padStart(3, "0");

// The periscope, the game's board, after the old cabinet (the owner's
// reference and mock, 2026-10-29): a bearing scale over a pill-shaped lens on
// a daytime sea under flat clouds, the torpedo lamps and the score under it,
// and the turn and FIRE buttons at the foot. The view turns: the sight is
// always the middle of the lens, between two fine etched lines, and the sea
// moves past as the periscope turns, so a ship off to the side is out of
// sight until the periscope comes round to it. The periscope turns only a
// little (±20°) and the ships keep far off under the horizon. A torpedo leaves
// from the middle of the view, between the lines, and leans the way the
// periscope is turned. A hit puts the sea in shadow so the
// fire glows. On a phone the scale sits inside the top of the lens and the
// lens takes the screen's height (torpedo.css); `tools` (pause, full screen)
// ride on its foot there. A physical thing, so it wears its own colours on
// every theme. Dragging a finger along the lens turns the periscope.
export function Periscope({
  mode,
  state,
  banner,
  overlay,
  tools,
  onFire,
  onHold,
  onAim
}: {
  mode: TorpedoMode;
  state: TorpedoState;
  banner: Banner | null;
  /** The round-over card, laid over the lens. */
  overlay?: ReactNode;
  /** Small buttons laid on the lens's foot, where a phone has no panel for them. */
  tools?: ReactNode;
  onFire: () => void;
  onHold: (side: "left" | "right", down: boolean) => void;
  onAim: (bearing: number | null) => void;
}) {
  const { t } = useTranslation();
  const [lensRef, aspect] = useAspect<HTMLDivElement>();
  const drag = useRef<{ id: number; x: number; bearing: number } | null>(null);
  const view = viewOf(aspect);
  const { top, height } = view;
  const bottom = top + height;
  const tubeY = tubeOf(bottom);
  const lanes = laneYs(tubeY);
  const { bearing } = state;
  const sighted = mode === "play" ? inSights(state, bearing) : undefined;
  /** The scene turns under the lens: it moves by as much as the sight is off dead ahead. */
  const turned = { transform: `translateX(${-bearing * K}px)` };

  /** Dragging along the lens turns the periscope: the sea follows the finger. */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "play") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* a pointer already gone: the drag still follows it while over the lens */
    }
    drag.current = { id: event.pointerId, x: event.clientX, bearing };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (from?.id !== event.pointerId) return;
    const width = event.currentTarget.getBoundingClientRect().width || 1;
    onAim(from.bearing - ((event.clientX - from.x) / width) * (view.width / K));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    onAim(null);
  };

  const degrees = bearing / 10;

  const shown = banner && state.tick - banner.tick < BANNER_TICKS ? banner : null;
  let bannerText: string | null = null;
  if (shown?.kind === "hit") bannerText = t("torpedo.lens.hit", { points: shown.points });
  if (shown?.kind === "miss") bannerText = t("torpedo.lens.miss");
  if (shown?.kind === "bonus") bannerText = t("torpedo.lens.bonus");
  let prompt: string | null = null;
  if (mode === "demo") prompt = t("torpedo.lens.start");
  if (mode === "paused") prompt = t("torpedo.lens.paused");

  // A hit puts the sea in shadow for a moment, so the fire glows.
  const hitAge = shown?.kind === "hit" ? state.tick - shown.tick : null;
  const dusk = hitAge !== null && hitAge < SINK_TICKS ? 0.62 * (1 - hitAge / SINK_TICKS) : 0;

  const ships = [...state.ships].sort((a, b) => lanes[SHIPS[a.kind].lane] - lanes[SHIPS[b.kind].lane]);
  const torpedo = state.torpedo;
  const seconds = Math.ceil((state.clock * TICK_MS) / 1000);
  const bonusRound = state.round > 1;
  const progress = bonusRound ? 1 : Math.min(1, state.score / BONUS_AT);

  return (
    <div className={`torpedo-scope is-${mode}`}>
      <div className="torpedo-cabinet">
        {/* The scale turns with the view: each figure in percent of the lens's
            width over the bearing it names, the strip moved by the sight. */}
        <div className="torpedo-bearings" aria-hidden="true">
          <div className="torpedo-bearings-strip" style={{ transform: `translateX(${(-bearing * K * 100) / view.width}%)` }}>
            {SCALE.map((d) => {
              const major = d % 15 === 0;
              return (
                <span
                  key={d}
                  className={`torpedo-bearing${major ? " is-major" : ""}${major && Math.abs(d - degrees) < 7.5 ? " is-on" : ""}`}
                  style={{ left: `${((screenX(d * 10) - view.left) / view.width) * 100}%` }}
                >
                  {major && <b>{compass(d)}</b>}
                </span>
              );
            })}
          </div>
          <span className="torpedo-bearing-mark" />
        </div>

        <div
          ref={lensRef}
          className="torpedo-lens"
          role="img"
          aria-label={t("torpedo.lens.label", { bearing: compass(Math.round(degrees)) })}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <svg viewBox={`${view.left} ${top} ${view.width} ${height}`} preserveAspectRatio="xMidYMid slice" shapeRendering="geometricPrecision" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="torpedo-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3f7b9a" />
                <stop offset="0.75" stopColor="#80adbd" />
                <stop offset="1" stopColor="#a6c6cc" />
              </linearGradient>
              <linearGradient id="torpedo-sea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1f5c65" />
                <stop offset="1" stopColor="#0a2e35" />
              </linearGradient>
              <radialGradient id="torpedo-burst">
                <stop offset="0" stopColor="#fff0c8" stopOpacity="0.95" />
                <stop offset="0.3" stopColor="#ffa046" stopOpacity="0.85" />
                <stop offset="0.6" stopColor="#d14b2d" stopOpacity="0.45" />
                <stop offset="1" stopColor="#d14b2d" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x={SEA_FROM} y={top} width={SEA_TO - SEA_FROM} height={HORIZON - top} fill="url(#torpedo-sky)" />
            <rect x={SEA_FROM} y={HORIZON} width={SEA_TO - SEA_FROM} height={bottom - HORIZON} fill="url(#torpedo-sea)" />

            <g className="torpedo-world" style={turned}>
              <g className="torpedo-clouds">
                {CLOUDS.filter(([, rise, width]) => HORIZON - rise - width * 0.34 > top).map(([x, rise, width]) => (
                  <path key={`${x}:${rise}`} d={cloudPath(x, HORIZON - rise, width)} />
                ))}
              </g>
              <line x1={SEA_FROM} x2={SEA_TO} y1={HORIZON} y2={HORIZON} className="torpedo-horizon" />
              <g className="torpedo-glints">
                {GLINTS.filter(([, y]) => y < bottom).map(([x, y, width]) => (
                  <rect key={`${x}:${y}`} x={x - width / 2} y={y} width={width} height={y < 260 ? 1.5 : 2.5} rx={1} />
                ))}
              </g>
              <rect x={SEA_FROM} y={top} width={SEA_TO - SEA_FROM} height={height} fill="#02090b" opacity={dusk} />

              {ships.map((ship) => {
                const x = screenX(ship.x);
                const s = shipScale(ship);
                const y = lanes[SHIPS[ship.kind].lane];
                const sinking = ship.sinking === null ? 0 : 1 - ship.sinking / SINK_TICKS;
                const height = SHIP_HEIGHT[ship.kind] * s;
                return (
                  <g key={ship.id}>
                    <g
                      className="torpedo-ship"
                      style={{ transform: `translate(${x}px, ${y + sinking * height}px) scale(${s * ship.dir}, ${s})`, opacity: 1 - sinking * 0.9 }}
                    >
                      <path d={SHIP_PATHS[ship.kind]} transform="translate(-50 0)" className={`torpedo-ship-hull${sighted?.id === ship.id ? " is-sighted" : ""}`} />
                    </g>
                    {ship.sinking === null && (
                      <rect x={x - ship.dir * 50 * s - (ship.dir > 0 ? 30 * s : 0)} y={y - 1} width={30 * s} height={Math.max(1.5, 2 * s)} rx={1} className="torpedo-ship-wake" />
                    )}
                    {ship.sinking !== null && sinking < 0.6 && (
                      <>
                        <circle cx={x} cy={y - height * 0.4} r={height * (0.8 + sinking * 2.4)} fill="url(#torpedo-burst)" opacity={1 - sinking / 0.6} />
                        {/* The fire's reflection, a column down the water. */}
                        <ellipse cx={x} cy={y + height * 1.2} rx={height * 0.7} ry={height * 1.4} fill="url(#torpedo-burst)" opacity={0.55 * (1 - sinking / 0.6)} />
                      </>
                    )}
                    {ship.sinking !== null && (
                      <ellipse cx={x} cy={y} rx={50 * s * (0.6 + sinking)} ry={3 + 4 * s} className="torpedo-splash" opacity={1 - sinking} />
                    )}
                  </g>
                );
              })}

              {/* Which way a torpedo would go: the gyro dial at the tube. */}
              {(mode === "play" || mode === "paused") && <GyroDial bearing={bearing} tubeY={tubeY} ready={!torpedo} scale={view.width > SPAN.wide ? 2.2 : 1} />}

              {torpedo && (
                <g className="torpedo-wake">
                  {LAMP_RUNS.filter((run) => run <= torpedo.run).map((run) => {
                    const point = wakePoint(torpedo.bearing, run, tubeY);
                    const head = torpedo.run - run < LAMP_EVERY;
                    const glow = 0.35 + 0.65 * (run / RANGE.far);
                    return (
                      <circle
                        key={run}
                        cx={point.x}
                        cy={point.y}
                        r={point.size / (head ? 1.6 : 2)}
                        className={head ? "is-head" : undefined}
                        opacity={head ? 1 : glow * 0.8}
                      />
                    );
                  })}
                </g>
              )}
            </g>

            {/* The reticle: two fine etched lines; the sight is the middle between them. */}
            <g className="torpedo-reticle">
              {[-1, 1].map((side) => {
                const x = view.left + view.width / 2 + (side * view.width) / 6;
                return <line key={side} x1={x} x2={x} y1={top} y2={bottom} />;
              })}
            </g>
          </svg>
          <div className="torpedo-vignette" aria-hidden="true" />
          {bannerText && <p key={shown!.tick} className={`torpedo-banner is-${shown!.kind}`} aria-hidden="true">{bannerText}</p>}
          {prompt && !overlay && <p className="torpedo-prompt">{prompt}</p>}
          {tools && !overlay && <div className="torpedo-tools">{tools}</div>}
        </div>

        {/* One row: the score, the tubes, what the bonus round needs, the clock.
            A phone hides the labels and keeps the figures. */}
        <div className="torpedo-hud">
          <div className="torpedo-hud-figure is-score">
            <span className="torpedo-hud-label">{t("torpedo.hud.score")}</span>
            <span className="torpedo-hud-value" aria-live="off">{formatScore(state.score)}</span>
          </div>
          <div className="torpedo-hud-tubes">
            <span className="torpedo-hud-label">{t("torpedo.hud.torpedoes", { left: state.torpedoesLeft, of: TORPEDOES })}</span>
            <span className="torpedo-lamps" role="img" aria-label={t("torpedo.hud.torpedoesLabel", { count: state.torpedoesLeft })}>
              {Array.from({ length: TORPEDOES }, (_, i) => (
                <span key={i} className={`torpedo-lamp${i < state.torpedoesLeft ? " is-lit" : ""}`} />
              ))}
            </span>
          </div>
          <div className="torpedo-hud-figure">
            <span className="torpedo-hud-label">{bonusRound ? t("torpedo.hud.bonusRound") : t("torpedo.hud.bonusAt")}</span>
            <span className="torpedo-hud-value">{bonusRound ? t("torpedo.hud.round", { round: state.round }) : formatScore(BONUS_AT)}</span>
          </div>
          <div className="torpedo-hud-figure is-clock">
            <span className="torpedo-hud-label">{t("torpedo.hud.clock")}</span>
            <span className="torpedo-hud-value">{t("torpedo.hud.time", { seconds })}</span>
          </div>
        </div>
        <div className={`torpedo-progress${state.bonus ? " is-earned" : ""}`} aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {overlay && <div className="torpedo-overlay">{overlay}</div>}
      </div>

      <div className="torpedo-controls">
        <button
          type="button"
          className="torpedo-turn"
          aria-label={t("torpedo.controls.left")}
          disabled={mode !== "play"}
          onPointerDown={() => onHold("left", true)}
          onPointerUp={() => onHold("left", false)}
          onPointerLeave={() => onHold("left", false)}
          onPointerCancel={() => onHold("left", false)}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={keepFocus}
        >
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="torpedo-fire"
          onMouseDown={keepFocus}
          disabled={mode === "paused"}
          onPointerDown={(event) => {
            if (event.button === 0) onFire();
          }}
          // A keyboard press of the button: a pointer press has fired already.
          onClick={(event) => {
            if (event.detail === 0) onFire();
          }}
        >
          {mode === "play" || mode === "paused" ? t("torpedo.controls.fire") : mode === "bonus" ? t("torpedo.controls.bonus") : t("torpedo.controls.start")}
        </button>
        <button
          type="button"
          className="torpedo-turn"
          aria-label={t("torpedo.controls.right")}
          disabled={mode !== "play"}
          onPointerDown={() => onHold("right", true)}
          onPointerUp={() => onHold("right", false)}
          onPointerLeave={() => onHold("right", false)}
          onPointerCancel={() => onHold("right", false)}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={keepFocus}
        >
          <ChevronRight size={26} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
