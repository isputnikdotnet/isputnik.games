import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eraser, RotateCw, Shuffle } from "lucide-react";
import { SeaBattle, type FleetKind, type Ship } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { SeaBoard, type Cell } from "./SeaBoard";

// Laying a fleet: pick a ship from the tray, tap the square its bow goes on;
// tap a laid ship to lift it again. Random lays whatever is left; Ready hands
// the fleet to the game once every ship is down.
export function FleetEditor({
  fleet,
  size,
  title,
  readyLabel,
  busy = false,
  onReady
}: {
  fleet: FleetKind;
  size: number;
  title: string;
  readyLabel: string;
  busy?: boolean;
  onReady: (ships: Ship[]) => void;
}) {
  const { t } = useTranslation();
  const [ships, setShips] = useState<Ship[]>([]);
  const [horizontal, setHorizontal] = useState(true);
  const missing = SeaBattle.missingShips(ships, fleet);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  // The ship to lay next: the one picked, else the longest still missing.
  const length = chosen !== null && missing.includes(chosen) ? chosen : missing[0] ?? null;
  const lengths = [...new Set(SeaBattle.FLEETS[fleet])];
  const empty = new Array<number>(size * size).fill(SeaBattle.UNKNOWN);

  const ghost: Ship | null = hover && length !== null ? { x: hover.x, y: hover.y, length, horizontal } : null;
  const ghostValid = ghost ? SeaBattle.canPlace(ghost, ships, size) : true;

  const tap = (x: number, y: number) => {
    const onShip = SeaBattle.shipAt(ships, x, y);
    if (onShip) {
      setShips(ships.filter((ship) => ship !== onShip));
      setChosen(onShip.length);
      return;
    }
    if (length === null) return;
    const ship: Ship = { x, y, length, horizontal };
    if (!SeaBattle.canPlace(ship, ships, size)) return;
    setShips([...ships, ship]);
  };

  return (
    <section className="sea-editor">
      <header className="sea-editor-head">
        <h2>{title}</h2>
        <p className="muted">{t("seabattle.place.hint")}</p>
      </header>
      <div className="sea-editor-body">
        <div className="sea-editor-board">
          <SeaBoard
            size={size}
            shots={empty}
            ships={ships}
            kind="own"
            ghost={ghost}
            ghostValid={ghostValid}
            canTarget={() => true}
            onCell={tap}
            onHover={setHover}
            columns={t("seabattle.columns")}
            label={t("seabattle.place.boardAria")}
          />
        </div>
        <aside className="sea-editor-side">
          <div className="sea-tray" role="group" aria-label={t("seabattle.place.tray")}>
            {lengths.map((deck) => {
              const left = missing.filter((l) => l === deck).length;
              return (
                <Button
                  key={deck}
                  variant="chip"
                  className="sea-tray-ship"
                  selected={deck === length}
                  disabled={left === 0}
                  onClick={() => setChosen(deck)}
                  aria-label={t("seabattle.place.trayShip", { length: deck, count: left })}
                >
                  <span className="sea-tray-decks" aria-hidden="true">
                    {Array.from({ length: deck }, (_, i) => <span key={i} className="sea-tray-deck" />)}
                  </span>
                  <span className="sea-tray-count">×{left}</span>
                </Button>
              );
            })}
          </div>
          <div className="sea-editor-actions">
            <Button variant="secondary" onClick={() => setHorizontal(!horizontal)} aria-pressed={!horizontal}>
              <RotateCw size={16} aria-hidden="true" /> {horizontal ? t("seabattle.place.acrossDown") : t("seabattle.place.downAcross")}
            </Button>
            <Button variant="secondary" onClick={() => setShips(SeaBattle.randomFleet(fleet, size, Math.random, ships))} disabled={missing.length === 0}>
              <Shuffle size={16} aria-hidden="true" /> {t("seabattle.place.random")}
            </Button>
            <Button variant="secondary" onClick={() => setShips([])} disabled={ships.length === 0}>
              <Eraser size={16} aria-hidden="true" /> {t("seabattle.place.clear")}
            </Button>
          </div>
          <p className="muted sea-editor-left">
            {missing.length === 0 ? t("seabattle.place.allLaid") : t("seabattle.place.left", { count: missing.length })}
          </p>
          <Button variant="primary" disabled={missing.length > 0 || busy} onClick={() => onReady(ships)}>
            {busy ? t("seabattle.place.sending") : readyLabel}
          </Button>
        </aside>
      </div>
    </section>
  );
}
