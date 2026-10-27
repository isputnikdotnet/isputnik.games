import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Torpedo, type TorpedoState } from "@isputnik/games-engine";
import { SHIP_HEIGHT, SHIP_PATHS } from "./ships";
import type { TorpedoMode } from "./useTorpedoRun";
import { CENTRE, HORIZON, K, LANE_Y, LENS_H, TUBE_Y, formatScore, screenX, shipScale, wakePoint } from "./view";

const { SHIPS, SINK_TICKS, RANGE, TORPEDOES, BONUS_AT, TICK_MS, inSights } = Torpedo;

/** Far headlands on the horizon, at fixed bearings: they slide as the periscope turns. */
const HEADLANDS: readonly [bearing: number, width: number, height: number][] = [
  [-760, 220, 9], [-430, 120, 5], [130, 260, 7], [520, 160, 11], [820, 90, 4]
];
/** Rows of glints on the water, each with its own spacing, near rows wider apart. */
const GLINT_ROWS: readonly [y: number, every: number, width: number][] = [
  [222, 70, 10], [252, 95, 16], [296, 130, 24], [348, 170, 34], [404, 220, 46]
];
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
// the dusk sea, the torpedo lamps and the score under it, and the turn and
// FIRE buttons at the foot. A physical thing, so it wears its own colours on
// every theme (torpedo.css). Dragging across the lens turns the periscope.
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
  const drag = useRef<{ id: number; x: number; bearing: number } | null>(null);
  const viewW = LENS_H * aspect;
  const left = CENTRE - viewW / 2;
  const box = `${left} 0 ${viewW} ${LENS_H}`;
  const { bearing } = state;
  const visible = (x: number, margin = 200) => x > left - margin && x < left + viewW + margin;
  const sighted = mode === "play" ? inSights(state, bearing) : undefined;

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
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const perPixel = viewW / event.currentTarget.clientWidth / K;
    onAim(start.bearing + (event.clientX - start.x) * perPixel);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    onAim(null);
  };

  // The bearing scale: a tick every 5°, a figure every 15°.
  const degrees = bearing / 10;
  const scale: number[] = [];
  for (let d = Math.ceil((degrees - 60) / 5) * 5; d <= degrees + 60; d += 5) scale.push(d);

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
          {scale.map((d) => {
            const at = ((CENTRE + (d - degrees) * 10 * K - left) / viewW) * 100;
            if (at < 2 || at > 98) return null;
            const major = d % 15 === 0;
            return (
              <span key={d} className={`torpedo-bearing${major ? " is-major" : ""}${major && Math.abs(d - degrees) < 7.5 ? " is-on" : ""}`} style={{ left: `${at}%` }}>
                {major && <b>{compass(d)}</b>}
              </span>
            );
          })}
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
          <svg viewBox={box} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
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
            <rect x={left} y={0} width={viewW} height={HORIZON} fill="url(#torpedo-sky)" />
            <rect x={left} y={HORIZON} width={viewW} height={LENS_H - HORIZON} fill="url(#torpedo-sea)" />
            <g className="torpedo-headlands">
              {HEADLANDS.map(([at, width, height]) => {
                const x = screenX(at, bearing);
                if (!visible(x, width)) return null;
                return <path key={at} d={`M${x - width / 2} ${HORIZON} Q${x - width / 4} ${HORIZON - height} ${x} ${HORIZON - height * 0.8} T${x + width / 2} ${HORIZON} Z`} />;
              })}
            </g>
            <line x1={left} x2={left + viewW} y1={HORIZON} y2={HORIZON} className="torpedo-horizon" />
            <g className="torpedo-glints">
              {GLINT_ROWS.map(([y, every, width], row) => {
                const out: ReactNode[] = [];
                const offset = row * 37;
                const from = Math.floor((bearing + (left - CENTRE) / K - offset) / every) - 1;
                const to = Math.ceil((bearing + (left + viewW - CENTRE) / K - offset) / every) + 1;
                for (let i = from; i <= to; i++) {
                  const x = screenX(i * every + offset + ((i * 53) % 29), bearing);
                  out.push(<rect key={`${row}:${i}`} x={x - width / 2} y={y + ((i * 7) % 5)} width={width} height={row < 2 ? 1.5 : 2.5} rx={1} />);
                }
                return out;
              })}
            </g>

            {ships.map((ship) => {
              const x = screenX(ship.x, bearing);
              if (!visible(x)) return null;
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
                  const point = wakePoint(torpedo.bearing, run, bearing);
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

            <g className={`torpedo-crosshair${sighted ? " is-sighted" : ""}`}>
              <line x1={CENTRE} x2={CENTRE} y1={40} y2={HORIZON - 20} />
              <line x1={CENTRE} x2={CENTRE} y1={HORIZON + 20} y2={TUBE_Y - 30} />
              <line x1={left + 40} x2={CENTRE - 24} y1={HORIZON} y2={HORIZON} />
              <line x1={CENTRE + 24} x2={left + viewW - 40} y1={HORIZON} y2={HORIZON} />
              {[-200, -100, 100, 200].map((dx) => (
                <line key={dx} x1={CENTRE + dx} x2={CENTRE + dx} y1={HORIZON - (Math.abs(dx) === 200 ? 8 : 6)} y2={HORIZON + (Math.abs(dx) === 200 ? 8 : 6)} />
              ))}
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
