import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, upgradeDatabase, type Db } from "../src/db.js";
import { MatchError, answerDraw, answerInvitation, createMatch, getMatch, playMove, rememberMember, resign } from "../src/matches.js";

const mum = { id: "mum", name: "Мама" };
const dad = { id: "dad", name: "Dad" };

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, mum);
  rememberMember(db, dad);
});

/** A chess match being played, mum White. */
function chessMatch() {
  const created = createMatch(db, mum, { game: "chess", options: {}, opponent: dad, seat: 0 });
  answerInvitation(db, "dad", created.id, "accept");
  return created.id;
}

const refused = (run: () => unknown) => {
  try {
    run();
  } catch (err) {
    return err instanceof MatchError ? err.status : -1;
  }
  return 0;
};

describe("draw offers in online chess", () => {
  it("ends the match drawn by agreement when the other side accepts", () => {
    const id = chessMatch();
    expect(getMatch(db, "mum", id).draw).toEqual({ offeredBy: null, canOffer: true });
    const offered = answerDraw(db, "mum", id, "offer");
    expect(offered.draw).toEqual({ offeredBy: 0, canOffer: false });
    // The other side sees the offer, and cannot offer one of their own over it.
    expect(getMatch(db, "dad", id).draw).toEqual({ offeredBy: 0, canOffer: false });
    expect(refused(() => answerDraw(db, "dad", id, "offer"))).toBe(409);
    // Nobody accepts their own offer.
    expect(refused(() => answerDraw(db, "mum", id, "accept"))).toBe(409);

    const drawn = answerDraw(db, "dad", id, "accept");
    expect(drawn).toMatchObject({ status: "finished", finishReason: "agreed", winner: null });
    expect(drawn.state.status).toEqual({ kind: "finished", winner: null, reason: "agreed" });
    expect(drawn.draw).toBeUndefined();
  });

  it("is declined by an answer or by playing on, and withdrawn by its maker", () => {
    const id = chessMatch();
    answerDraw(db, "mum", id, "offer");
    expect(answerDraw(db, "dad", id, "decline").draw).toEqual({ offeredBy: null, canOffer: true });

    // Mum may not offer again straight away: two moves first.
    expect(getMatch(db, "mum", id).draw?.canOffer).toBe(false);
    expect(refused(() => answerDraw(db, "mum", id, "offer"))).toBe(409);
    playMove(db, "mum", id, { from: "e2", to: "e4" }, 0);
    expect(getMatch(db, "mum", id).draw?.canOffer).toBe(false);
    playMove(db, "dad", id, { from: "e7", to: "e5" }, 1);
    expect(getMatch(db, "mum", id).draw?.canOffer).toBe(true);

    // Offered on her own move, it stands when she moves; Dad's move declines it.
    answerDraw(db, "mum", id, "offer");
    playMove(db, "mum", id, { from: "g1", to: "f3" }, 2);
    expect(getMatch(db, "dad", id).draw?.offeredBy).toBe(0);
    playMove(db, "dad", id, { from: "b8", to: "c6" }, 3);
    expect(getMatch(db, "dad", id).draw?.offeredBy).toBeNull();

    answerDraw(db, "dad", id, "offer");
    expect(refused(() => answerDraw(db, "mum", id, "withdraw"))).toBe(409);
    expect(answerDraw(db, "dad", id, "withdraw").draw?.offeredBy).toBeNull();
    expect(getMatch(db, "mum", id).status).toBe("playing");
  });

  it("is only for chess, and only while the match is played", () => {
    const dots = createMatch(db, mum, { game: "dots", options: { size: 10, targetCaptures: 1 }, opponent: dad, seat: 0 });
    expect(refused(() => answerDraw(db, "mum", dots.id, "offer"))).toBe(409);
    answerInvitation(db, "dad", dots.id, "accept");
    expect(getMatch(db, "mum", dots.id).draw).toBeUndefined();
    expect(refused(() => answerDraw(db, "mum", dots.id, "offer"))).toBe(400);

    const id = chessMatch();
    answerDraw(db, "mum", id, "offer");
    resign(db, "dad", id);
    expect(refused(() => answerDraw(db, "dad", id, "accept"))).toBe(409);
  });

  it("adds its columns to a database made before them", () => {
    const old = openDatabase(":memory:");
    old.exec("ALTER TABLE matches DROP COLUMN draw_offer; ALTER TABLE matches DROP COLUMN draw_offers;");
    upgradeDatabase(old);
    const names = (old.prepare("PRAGMA table_info(matches)").all() as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["draw_offer", "draw_offers"]));
  });
});
