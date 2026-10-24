import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Dominoes, otherPlayer, type DominoesMove, type DominoesState, type End, type PlayerIndex, type Tile } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { DominoTile, type TileTone } from "./DominoTile";
import { fitLine, layoutLine, type Candidate } from "./layout";

// The table: a square of felt in a wooden rim. The other hand lies face down
// along the top, the boneyard in the corner, the line in the middle and — on a
// desktop — the player's own hand along the bottom, tiles standing up. On a
// phone the hand sits under the table in a row of its own, where tiles can be
// big enough to tap. Everything on the felt is placed in units of a 1000-unit
// square and drawn in percent, so it scales with the board.

type Play = Extract<DominoesMove, { kind: "play" }>;

export const tileName = (tile: readonly number[]) => `${tile[0]}:${tile[1]}`;
const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

/** The plays a tile has, with the same tile on two ends that match counted once. */
export function playsOfTile(state: DominoesState, plays: Play[], tile: Tile): Play[] {
  const mine = plays.filter((play) => same(play.tile, tile));
  const ends = Dominoes.endsOf(state);
  if (mine.length > 1 && ends && ends[0] === ends[1]) return [mine[0]];
  return mine;
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
  max: number;
  min: number;
}

const DESKTOP_LINE: Area = { x: 30, y: 150, w: 940, h: 650, max: 52, min: 16 };
const PHONE_LINE: Area = { x: 20, y: 110, w: 960, h: 870, max: 62, min: 20 };

const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: `${x / 10}%`,
  top: `${y / 10}%`,
  width: `${w / 10}%`,
  height: `${h / 10}%`
});

export function DominoesTable({
  state,
  me,
  names,
  active,
  selected,
  lastTile,
  phone,
  onPick,
  onLay,
  onDraw
}: {
  state: DominoesState;
  me: PlayerIndex;
  names: [string, string];
  /** The person may move now. */
  active: boolean;
  selected: Tile | null;
  lastTile: Tile | null;
  phone: boolean;
  onPick: (tile: Tile) => void;
  onLay: (end: End) => void;
  onDraw: () => void;
}) {
  const { t } = useTranslation();
  // Drawn from what this seat may see, whatever the state holds.
  const view = Dominoes.viewFor(state, me);
  const them = otherPlayer(me);
  const hand = view.hands[me];
  const legal = active ? Dominoes.legalMoves(view) : [];
  const plays = legal.filter((m): m is Play => m.kind === "play");
  const canDraw = legal.some((m) => m.kind === "draw");
  const ends = Dominoes.endsOf(view);

  // Where the picked-up tile could go, as [the number meeting the end, the other].
  const extra: { left?: Candidate; right?: Candidate } = {};
  if (selected && ends) {
    for (const play of playsOfTile(view, plays, selected)) {
      const end = play.end;
      const meet = ends[end === "left" ? 0 : 1];
      extra[end] = [meet, play.tile[0] === meet ? play.tile[1] : play.tile[0]];
    }
  }
  const area = phone ? PHONE_LINE : DESKTOP_LINE;
  // The size is worked out as if a tile were waiting at both ends, so picking
  // one up never makes the line jump.
  const worst: { left?: Candidate; right?: Candidate } = ends
    ? { left: [ends[0], (ends[0] + 1) % 7], right: [ends[1], (ends[1] + 1) % 7] }
    : {};
  const size = fitLine(view.line, view.leadIndex, area.w, area.h, area.max, area.min, worst).size;
  const laid = layoutLine(view.line, view.leadIndex, size, area.w, area.h, extra);

  const toneOf = (tile: Tile): TileTone => {
    if (!active) return "plain";
    if (selected && same(selected, tile)) return "selected";
    return plays.some((play) => same(play.tile, tile)) ? "playable" : "dim";
  };
  const tileLabel = (tile: Tile) => {
    const tone = toneOf(tile);
    return tone === "playable" || tone === "selected" ? t("dominoes.table.tileFits", { tile: tileName(tile) }) : tileName(tile);
  };

  // The other hand, face down along the top.
  const theirCount = view.handCounts[them];
  const ts = Math.min(phone ? 30 : 34, 760 / Math.max(1, theirCount * 1.3));
  const theirWidth = theirCount * ts + Math.max(0, theirCount - 1) * ts * 0.3;

  // The player's own hand along the bottom of the felt (desktop).
  const hs = Math.min(60, (900 - Math.max(0, hand.length - 1) * 12) / Math.max(1, hand.length));
  const handWidth = hand.length * hs + Math.max(0, hand.length - 1) * 12;
  const handTop = 1000 - 30 - 2 * hs;

  const lineSummary = ends
    ? t("dominoes.table.line", { count: view.line.length, left: ends[0], right: ends[1] })
    : t("dominoes.table.lineEmpty");

  const pile = Math.min(3, view.boneyardCount);
  const boneyard = (
    <>
      <span className="dom-pile" aria-hidden="true">
        {Array.from({ length: pile }, (_, i) => (
          <span key={i} className="dom-pile-tile" style={{ left: `${i * 6}%`, top: `${(pile - 1 - i) * 14}%` }}>
            <DominoTile a={0} b={0} vertical={false} faceDown />
          </span>
        ))}
      </span>
      <span className="dom-caption">{t("dominoes.table.boneyard", { count: view.boneyardCount })}</span>
    </>
  );

  const felt = (
    <div className="dom-felt">
      <div className="dom-felt-inner">
        <div className="dom-abs dom-theirs" style={box(500 - theirWidth / 2, 26, theirWidth, 2 * ts)} aria-hidden="true">
          {Array.from({ length: theirCount }, (_, i) => (
            <span key={i} className="dom-abs" style={{ left: `${(i * ts * 1.3 / theirWidth) * 100}%`, top: 0, width: `${(ts / theirWidth) * 100}%`, height: "100%" }}>
              <DominoTile a={0} b={0} vertical faceDown />
            </span>
          ))}
        </div>
        <span className="dom-abs dom-caption dom-theirs-caption" style={{ left: 0, width: "100%", top: `${(26 + 2 * ts + 12) / 10}%` }}>
          {t("dominoes.table.theirHand", { name: names[them], count: theirCount })}
        </span>

        {canDraw ? (
          <Button variant="bare" className="dom-abs dom-boneyard is-drawable" style={box(820, 24, 150, 110)} aria-label={t("dominoes.table.drawAria", { count: view.boneyardCount })} onClick={onDraw}>
            {boneyard}
          </Button>
        ) : (
          <div className="dom-abs dom-boneyard" style={box(820, 24, 150, 110)}>{boneyard}</div>
        )}

        <div className="dom-abs dom-line" style={box(area.x, area.y, area.w, area.h)}>
          <p className="visually-hidden">{lineSummary}</p>
          {laid.tiles.map((placed, index) => (
            <span key={index} className="dom-abs" style={box(placed.x * 1000 / area.w, placed.y * 1000 / area.h, placed.w * 1000 / area.w, placed.h * 1000 / area.h)}>
              <DominoTile
                a={placed.a}
                b={placed.b}
                vertical={placed.vertical}
                tone={lastTile && same(lastTile, [Math.min(placed.a, placed.b), Math.max(placed.a, placed.b)]) ? "last" : "plain"}
              />
            </span>
          ))}
          {selected && (["left", "right"] as const).map((end) => {
            const ghost = laid.ghosts[end];
            if (!ghost) return null;
            return (
              <Button
                key={end}
                variant="bare"
                className="dom-abs dom-ghost"
                style={box(ghost.x * 1000 / area.w, ghost.y * 1000 / area.h, ghost.w * 1000 / area.w, ghost.h * 1000 / area.h)}
                aria-label={t(end === "left" ? "dominoes.table.layLeft" : "dominoes.table.layRight", { tile: tileName(selected) })}
                onClick={() => onLay(end)}
              />
            );
          })}
        </div>

        {!phone && hand.map((tile, index) => (
          <Button
            key={tileName(tile)}
            variant="bare"
            className={`dom-abs dom-hand-tile is-${toneOf(tile)}`}
            style={box(500 - handWidth / 2 + index * (hs + 12), handTop, hs, 2 * hs)}
            aria-label={tileLabel(tile)}
            aria-pressed={selected ? same(selected, tile) : false}
            disabled={!active || toneOf(tile) === "dim"}
            onClick={() => onPick(tile)}
          >
            <DominoTile a={tile[0]} b={tile[1]} vertical tone={toneOf(tile)} />
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`dom-table${phone ? " is-phone" : ""}`} role="group" aria-label={t("dominoes.table.aria")}>
      {felt}
      {phone && (
        <div className="dom-hand-row" role="group" aria-label={t("dominoes.table.yourHand")}>
          {hand.map((tile) => (
            <Button
              key={tileName(tile)}
              variant="bare"
              className={`dom-hand-tile is-${toneOf(tile)}`}
              aria-label={tileLabel(tile)}
              aria-pressed={selected ? same(selected, tile) : false}
              disabled={!active || toneOf(tile) === "dim"}
              onClick={() => onPick(tile)}
            >
              <DominoTile a={tile[0]} b={tile[1]} vertical tone={toneOf(tile)} />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
