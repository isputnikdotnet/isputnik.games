import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Torpedo, type TorpedoState } from "@isputnik/games-engine";
import { SHIP_HEIGHT, SHIP_PATHS } from "./ships";
import type { TorpedoMode } from "./useTorpedoRun";
import { FIELD_W, HORIZON, K, LANE_Y, LENS_H, formatScore, screenX, shipScale, viewOf, wakePoint } from "./view";

const { SHIPS, SINK_TICKS, RANGE, TORPEDOES, BONUS_AT, TICK_MS, FIELD_HALF, inSights } = Torpedo;

/** Far headlands on the horizon, at fixed bearings. */
const HEADLANDS: readonly [bearing: number, width: number, height: number][] = [
  [-380, 160, 7], [-170, 90, 4], [210, 200, 8], [400, 110, 5]
];
/** Glints on the water, row by row, near rows wider apart: [x, y, width]. */
const GLINTS: readonly [number, number, number][] = [
  [222, 70, 10], [252, 95, 16], [296, 130, 24], [348, 170, 34], [404, 220, 46], [470, 260, 56], [540, 300, 64]
].flatMap(([y, every, width], row) =>
  Array.from({ length: Math.ceil(FIELD_W / every) + 1 }, (_, i): [number, number, number] => [i * every + ((row * 37 + i * 53) % 29) - row * 11, y + ((i * 7) % 5), width]));
/** The bearing scale: a tick every 5°, a figure every 15°, across the field. */
const SCALE: readonly number[] = Array.from({ length: (2 * FIELD_HALF) / 50 + 1 }, (_, i) => -FIELD_HALF / 10 + i * 5);
/** One lamp of the wake every this many ticks of the torpedo's run. */
const LAMP_EVERY = 4;
const LAMP_RUNS = Array.from({ length: RANGE.far / LAMP_EVERY + 1 }, (_, i) => i * LAMP_EVERY);

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

// The periscope, the game's board: a bearing scale over a pill-shaped lens on
// the dusk sea, the torpedo lamps and the score under it, and the sight and
// FIRE buttons at the foot. The view holds still and shows the whole field of
// attack; the sight moves along the horizon, and a torpedo runs straight up
// the lens from under it. A physical thing, so it wears its own colours on
// every theme (torpedo.css). A finger on the lens draws the sight to it.
export function Periscope({
  mode,
  state,
  banner,
  overlay,
  onFire,
  onHold,
  onAim
}: {
  mode: TorpedoMode;
  state: TorpedoState;
  banner: Banner | null;
  /** The round-over card, laid over the lens. */
  overlay?: ReactNode;
  onFire: () => void;
  onHold: (side: "left" | "right", down: boolean) => void;
  onAim: (bearing: number | null) => void;
}) {
  const { t } = useTranslation();
  const [lensRef, aspect] = useAspect<HTMLDivElement>();
  const drag = useRef<number | null>(null);
  const { top, height } = viewOf(aspect);
  const bottom = top + height;
  const tubeY = bottom - 12;
  const { bearing } = state;
  const sightX = screenX(bearing);
  const sighted = mode === "play" ? inSights(state, bearing) : undefined;

  /** The bearing under a finger on the lens. */
  const bearingAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (((event.clientX - rect.left) / rect.width) * FIELD_W - FIELD_W / 2) / K;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "play") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* a pointer already gone: the drag still follows it while over the lens */
    }
    drag.current = event.pointerId;
    onAim(bearingAt(event));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    onAim(bearingAt(event));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
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

  const ships = [...state.ships].sort((a, b) => LANE_Y[SHIPS[a.kind].lane] - LANE_Y[SHIPS[b.kind].lane]);
  const torpedo = state.torpedo;
  const seconds = Math.ceil((state.clock * TICK_MS) / 1000);
  const bonusRound = state.round > 1;
  const progress = bonusRound ? 1 : Math.min(1, state.score / BONUS_AT);

  return (
    <div className={`torpedo-scope is-${mode}`}>
      <div className="torpedo-cabinet">
        {/* Placed in percent of the lens's width, so each figure sits over the bearing it names. */}
        <div className="torpedo-bearings" aria-hidden="true">
          {SCALE.map((d) => {
            const at = (screenX(d * 10) / FIELD_W) * 100;
            if (at < 2 || at > 98) return null;
            const major = d % 15 === 0;
            return (
              <span key={d} className={`torpedo-bearing${major ? " is-major" : ""}${major && Math.abs(d - degrees) < 7.5 ? " is-on" : ""}`} style={{ left: `${at}%` }}>
                {major && <b>{compass(d)}</b>}
              </span>
            );
          })}
          <span className="torpedo-bearing-mark" style={{ left: `${(sightX / FIELD_W) * 100}%` }} />
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
          <svg viewBox={`0 ${top} ${FIELD_W} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="torpedo-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#24384a" />
                <stop offset="0.7" stopColor="#7c5a4c" />
                <stop offset="1" stopColor="#b8703f" />
              </linearGradient>
              <linearGradient id="torpedo-sea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2c5156" />
                <stop offset="1" stopColor="#0a1f23" />
              </linearGradient>
              <radialGradient id="torpedo-burst">
                <stop offset="0" stopColor="#fff0c8" stopOpacity="0.95" />
                <stop offset="0.3" stopColor="#ffa046" stopOpacity="0.85" />
                <stop offset="0.6" stopColor="#d14b2d" stopOpacity="0.45" />
                <stop offset="1" stopColor="#d14b2d" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x={0} y={top} width={FIELD_W} height={HORIZON - top} fill="url(#torpedo-sky)" />
            <rect x={0} y={HORIZON} width={FIELD_W} height={bottom - HORIZON} fill="url(#torpedo-sea)" />
            <g className="torpedo-headlands">
              {HEADLANDS.map(([at, width, height]) => {
                const x = screenX(at);
                return <path key={at} d={`M${x - width / 2} ${HORIZON} Q${x - width / 4} ${HORIZON - height} ${x} ${HORIZON - height * 0.8} T${x + width / 2} ${HORIZON} Z`} />;
              })}
            </g>
            <line x1={0} x2={FIELD_W} y1={HORIZON} y2={HORIZON} className="torpedo-horizon" />
            <g className="torpedo-glints">
              {GLINTS.filter(([, y]) => y < bottom).map(([x, y, width]) => (
                <rect key={`${x}:${y}`} x={x - width / 2} y={y} width={width} height={y < 260 ? 1.5 : 2.5} rx={1} />
              ))}
            </g>

            {ships.map((ship) => {
              const x = screenX(ship.x);
              const s = shipScale(ship);
              const y = LANE_Y[SHIPS[ship.kind].lane];
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
                    <circle cx={x} cy={y - height * 0.4} r={height * (0.8 + sinking * 2.4)} fill="url(#torpedo-burst)" opacity={1 - sinking / 0.6} />
                  )}
                  {ship.sinking !== null && (
                    <ellipse cx={x} cy={y} rx={50 * s * (0.6 + sinking)} ry={3 + 4 * s} className="torpedo-splash" opacity={1 - sinking} />
                  )}
                </g>
              );
            })}

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

            {/* The reticle's rule holds still on the horizon; the sight (its upright,
                and the tube's mark under it) slides along it. */}
            <g className={`torpedo-crosshair${sighted ? " is-sighted" : ""}`}>
              <line x1={30} x2={FIELD_W - 30} y1={HORIZON} y2={HORIZON} className="is-rule" />
              {[-300, -200, -100, 0, 100, 200, 300].map((at) => (
                <line key={at} x1={screenX(at)} x2={screenX(at)} y1={HORIZON - 5} y2={HORIZON + 5} className="is-rule" />
              ))}
              <g className="torpedo-sight" style={{ transform: `translateX(${sightX}px)` }}>
                <line x1={0} x2={0} y1={top + 30} y2={HORIZON - 18} />
                <line x1={0} x2={0} y1={HORIZON + 18} y2={tubeY - 24} />
                <line x1={-18} x2={18} y1={HORIZON} y2={HORIZON} />
                <path d={`M-10 ${tubeY + 6} L0 ${tubeY - 10} L10 ${tubeY + 6} Z`} />
              </g>
            </g>
          </svg>
          <div className="torpedo-vignette" aria-hidden="true" />
          {bannerText && <p key={shown!.tick} className={`torpedo-banner is-${shown!.kind}`} aria-hidden="true">{bannerText}</p>}
          {prompt && !overlay && <p className="torpedo-prompt">{prompt}</p>}
        </div>

        <div className="torpedo-hud">
          <div className="torpedo-hud-tubes">
            <span className="torpedo-hud-label">
              {t("torpedo.hud.torpedoes", { left: state.torpedoesLeft, of: TORPEDOES })}
              {" · "}
              {t("torpedo.hud.time", { seconds })}
            </span>
            <span className="torpedo-lamps" role="img" aria-label={t("torpedo.hud.torpedoesLabel", { count: state.torpedoesLeft })}>
              {Array.from({ length: TORPEDOES }, (_, i) => (
                <span key={i} className={`torpedo-lamp${i < state.torpedoesLeft ? " is-lit" : ""}`} />
              ))}
            </span>
          </div>
          <div className="torpedo-hud-figure">
            <span className="torpedo-hud-label">{t("torpedo.hud.score")}</span>
            <span className="torpedo-hud-value is-score" aria-live="off">{formatScore(state.score)}</span>
          </div>
          <div className="torpedo-hud-figure">
            <span className="torpedo-hud-label">{bonusRound ? t("torpedo.hud.bonusRound") : t("torpedo.hud.bonusAt")}</span>
            <span className="torpedo-hud-value">{bonusRound ? t("torpedo.hud.round", { round: state.round }) : formatScore(BONUS_AT)}</span>
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
