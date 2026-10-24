import { useLayoutEffect, useMemo, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SputnikRail, SputnikVariant } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { setSoundEnabled, useSoundEnabled } from "../../shared/sound";
import { litSegments, type LcdView } from "./lit";
import { buildLcd } from "./sprites";

/** A control's name, for the press flash a key gives it. */
export type HandheldControl = `rail${SputnikRail}` | "gameA" | "gameB" | "pause";

const RAIL_KEYS = ["Q", "A", "P", "L"] as const;

// The LCD: the sprites' SVG, put in once, and its segments switched by class
// on every render. React never re-creates the few hundred shapes.
function LcdScreen({ view, onTap }: { view: LcdView; onTap: (rail: SputnikRail) => void }) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const segments = useRef(new Map<string, Element>());
  const markup = useMemo(() => buildLcd({ gameA: t("sputnik.lcd.gameA"), gameB: t("sputnik.lcd.gameB") }), [t]);

  useLayoutEffect(() => {
    segments.current = new Map([...(host.current?.querySelectorAll("[data-seg]") ?? [])].map((el) => [el.getAttribute("data-seg")!, el]));
  }, [markup]);

  useLayoutEffect(() => {
    const on = litSegments(view, [...segments.current.keys()]);
    segments.current.forEach((el, id) => el.classList.toggle("is-on", on.has(id)));
  });

  // A tap on a quarter of the screen moves the net to that corner's rail.
  const tap = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const right = event.clientX - box.left > box.width / 2;
    const low = event.clientY - box.top > box.height / 2;
    onTap(((right ? 2 : 0) + (low ? 1 : 0)) as SputnikRail);
  };

  return (
    <div
      className="hh-lcd"
      ref={host}
      role="img"
      aria-label={t("sputnik.lcd.label")}
      onPointerDown={tap}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function RailButton({ rail, flash, onMove }: { rail: SputnikRail; flash: boolean; onMove: (rail: SputnikRail) => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="bare"
      className={`hh-big ${rail % 2 === 0 ? "is-up" : "is-down"}${flash ? " is-pressed" : ""}`}
      aria-label={t(`sputnik.controls.rail${rail}`, { key: RAIL_KEYS[rail] })}
      onPointerDown={(event) => {
        event.preventDefault();
        onMove(rail);
      }}
      onClick={() => onMove(rail)}
    >
      <svg className="hh-arrow" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path d="M5 0 10 9 5 7 0 9z" />
      </svg>
    </Button>
  );
}

function PillButton({ label, name, flash, onPress }: { label: string; name: string; flash: boolean; onPress: () => void }) {
  return (
    <div className="hh-small">
      <Button variant="bare" className={`hh-pill${flash ? " is-pressed" : ""}`} aria-label={name} onClick={onPress} />
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

// The handheld itself, after the owner's mock: a silver face in a teal rim, the
// LCD in its bezel, a pair of red buttons each side for the four rails, and
// Game A · Game B · Pause. Its own container queries rearrange it for a phone
// held upright (screen on top, a pair of buttons under each thumb).
export function Handheld({
  view,
  flash,
  onMove,
  onStart,
  onPause
}: {
  view: LcdView;
  /** The control a key just pressed, to show it pressed. */
  flash: HandheldControl | null;
  onMove: (rail: SputnikRail) => void;
  onStart: (variant: SputnikVariant) => void;
  onPause: () => void;
}) {
  const { t } = useTranslation();
  const sound = useSoundEnabled();
  const rail = (r: SputnikRail) => <RailButton rail={r} flash={flash === `rail${r}`} onMove={onMove} />;

  return (
    <div className="handheld">
      <div className="hh-device">
        <div className="hh-face">
          <div className="hh-left">
            <div className="hh-logo" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="17" r="6.5" className="hh-ink" />
                <circle cx="18" cy="15" r="2" className="hh-shine" />
                <path d="M24.5 21.5 35 32M15.5 21.5 5 32M24 22.5 30 35M16 22.5 10 35" className="hh-ink-line" />
                <text x="20" y="8" textAnchor="middle">РОБ-1</text>
              </svg>
            </div>
            <Button
              variant="bare"
              className="hh-sound"
              aria-pressed={sound}
              aria-label={sound ? t("app.soundOff") : t("app.soundOn")}
              onClick={() => setSoundEnabled(!sound)}
            >
              <span className="hh-led" aria-hidden="true" />
              <span aria-hidden="true">{t("sputnik.device.sound")}</span>
            </Button>
            <div className="hh-pair">
              {rail(0)}
              {rail(1)}
            </div>
          </div>

          <div className="hh-bezel">
            <div className="hh-legend">
              <div>
                <b>{t("sputnik.device.title")}</b>
                <small>{t("sputnik.device.subtitle")}</small>
              </div>
            </div>
            <div className="hh-lcd-frame">
              <LcdScreen view={view} onTap={onMove} />
            </div>
            <div className="hh-foot">iSPUTNIK · 1957</div>
          </div>

          <div className="hh-menu">
            <PillButton label={t("sputnik.device.gameA")} name={t("sputnik.controls.gameA")} flash={flash === "gameA"} onPress={() => onStart("A")} />
            <PillButton label={t("sputnik.device.gameB")} name={t("sputnik.controls.gameB")} flash={flash === "gameB"} onPress={() => onStart("B")} />
            <PillButton label={t("sputnik.device.pause")} name={t("sputnik.controls.pause")} flash={flash === "pause"} onPress={onPause} />
          </div>
          <div className="hh-pair hh-right">
            {rail(2)}
            {rail(3)}
          </div>
        </div>
      </div>
    </div>
  );
}
