import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eraser, RotateCw, Shuffle } from "lucide-react";
import { StarBattle, type FleetKind, type Vessel } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { SectorBoard, type Cell } from "./SectorBoard";

// Deploying a fleet: pick a vessel from the tray, tap the square its bow goes on;
// tap a deployed vessel to lift it again. Random lays whatever is left; Ready hands
// the fleet to the game once every vessel is down.
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
  onReady: (vessels: Vessel[]) => void;
}) {
  const { t } = useTranslation();
  const [vessels, setShips] = useState<Vessel[]>([]);
  const [horizontal, setHorizontal] = useState(true);
  const missing = StarBattle.missingVessels(vessels, fleet);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  // The vessel to deploy next: the one picked, else the longest still missing.
  const length = chosen !== null && missing.includes(chosen) ? chosen : missing[0] ?? null;
  const lengths = [...new Set(StarBattle.FLEETS[fleet])];
  const empty = new Array<number>(size * size).fill(StarBattle.UNKNOWN);

  const ghost: Vessel | null = hover && length !== null ? { x: hover.x, y: hover.y, length, horizontal } : null;
  const ghostValid = ghost ? StarBattle.canPlace(ghost, vessels, size) : true;

  const tap = (x: number, y: number) => {
    const onShip = StarBattle.vesselAt(vessels, x, y);
    if (onShip) {
      setShips(vessels.filter((vessel) => vessel !== onShip));
      setChosen(onShip.length);
      return;
    }
    if (length === null) return;
    const vessel: Vessel = { x, y, length, horizontal };
    if (!StarBattle.canPlace(vessel, vessels, size)) return;
    setShips([...vessels, vessel]);
  };

  return (
    <section className="star-editor">
      <header className="star-editor-head">
        <h2>{title}</h2>
        <p className="muted">{t("starbattle.place.hint")}</p>
      </header>
      <div className="star-editor-body">
        <div className="star-editor-board">
          <SectorBoard
            size={size}
            shots={empty}
            vessels={vessels}
            kind="own"
            ghost={ghost}
            ghostValid={ghostValid}
            canTarget={() => true}
            onCell={tap}
            onHover={setHover}
            columns={t("starbattle.columns")}
            label={t("starbattle.place.boardAria")}
          />
        </div>
        <aside className="star-editor-side">
          <div className="star-tray" role="group" aria-label={t("starbattle.place.tray")}>
            {lengths.map((deck) => {
              const left = missing.filter((l) => l === deck).length;
              return (
                <Button
                  key={deck}
                  variant="chip"
                  className="star-tray-vessel"
                  selected={deck === length}
                  disabled={left === 0}
                  onClick={() => setChosen(deck)}
                  aria-label={t("starbattle.place.trayVessel", { length: deck, count: left })}
                >
                  <span className="star-tray-decks" aria-hidden="true">
                    {Array.from({ length: deck }, (_, i) => <span key={i} className="star-tray-deck" />)}
                  </span>
                  <span className="star-tray-count">×{left}</span>
                </Button>
              );
            })}
          </div>
          <div className="star-editor-actions">
            <Button variant="secondary" onClick={() => setHorizontal(!horizontal)} aria-pressed={!horizontal}>
              <RotateCw size={16} aria-hidden="true" /> {horizontal ? t("starbattle.place.acrossDown") : t("starbattle.place.downAcross")}
            </Button>
            <Button variant="secondary" onClick={() => setShips(StarBattle.randomFleet(fleet, size, Math.random, vessels))} disabled={missing.length === 0}>
              <Shuffle size={16} aria-hidden="true" /> {t("starbattle.place.random")}
            </Button>
            <Button variant="secondary" onClick={() => setShips([])} disabled={vessels.length === 0}>
              <Eraser size={16} aria-hidden="true" /> {t("starbattle.place.clear")}
            </Button>
          </div>
          <p className="muted star-editor-left">
            {missing.length === 0 ? t("starbattle.place.allDeployed") : t("starbattle.place.left", { count: missing.length })}
          </p>
          <Button variant="primary" disabled={missing.length > 0 || busy} onClick={() => onReady(vessels)}>
            {busy ? t("starbattle.place.sending") : readyLabel}
          </Button>
        </aside>
      </div>
    </section>
  );
}
