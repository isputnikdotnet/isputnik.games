import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, LogOut, RotateCcw, Undo2 } from "lucide-react";
import { dots, type DotsMove, type PlayerIndex } from "@isputnik/games-engine";
import { Comms } from "../../shared/Comms";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import type { CommsLine } from "../../shared/commsLines";
import { dotsLines } from "./comms";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { follow, href, navigate } from "../../router";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { GameStage } from "../../shared/GameStage";
import { DotsBoard } from "./DotsBoard";
import { DotsScoreboard } from "./DotsScoreboard";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { NewGameForm } from "./NewGameForm";
import { isComputerSeat, useDotsGame } from "./useDotsGame";
import type { DotsSetup } from "./storage";

type Pending = "end" | "new" | "exit" | null;

const NO_MOVES: DotsMove[] = [];

export function DotsPage() {
  const { t } = useTranslation();
  const controller = useDotsGame();
  const phone = useMediaQuery(PHONE);
  const [pending, setPending] = useState<Pending>(null);
  // The result dialog can be put aside to look at the final board; it stays
  // aside for that ending only (a new game's end shows it again).
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const { game } = controller;
  const feed = useFeed(dots, { size: game?.state.size ?? 15, targetCaptures: game?.state.targetCaptures ?? null }, game?.state.moves ?? NO_MOVES);
  // Against the computer the sounds take the human's side; two at one screen, neither.
  useGameSounds(game && localSound("dots", feed, game.setup.mode === "computer" ? (game.setup.computerPlays === 0 ? 1 : 0) : null, game.state.status));

  const seatName = (setup: DotsSetup, player: PlayerIndex) =>
    isComputerSeat(setup, player) ? t("dots.players.computer") : t(player === 0 ? "dots.players.blue" : "dots.players.red");

  if (!game) {
    return (
      <section className="dots-page">
        <PageHead title={t("games.dots.name")} />
        <NewGameForm onStart={controller.start} />
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const finished = status.kind === "finished";
  const endingKey = finished ? `${state.moves.length}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey;

  let statusLine: string;
  if (status.kind === "playing") {
    statusLine = controller.thinking ? t("dots.thinking") : t("dots.turn", { player: seatName(setup, status.turn) });
  } else {
    statusLine = status.winner === null ? t("dots.end.draw") : t("dots.end.winner", { player: seatName(setup, status.winner) });
  }

  // Blue is "you" in the log: the person against the computer, or whoever
  // took blue when two people share the screen.
  const me: PlayerIndex = setup.mode === "computer" ? (setup.computerPlays === 0 ? 1 : 0) : 0;
  const names: [string, string] = [seatName(setup, 0), seatName(setup, 1)];
  const lines: CommsLine[] = dotsLines(feed, me, names, t);
  if (status.kind === "finished") {
    lines.push({ key: "end", kind: "system", text: status.winner === null ? t("comms.draw") : t("comms.winner", { name: names[status.winner] }) });
  } else {
    lines.push({ key: "turn", kind: "system", text: status.turn === me ? t("comms.yourMove") : t("comms.toMove", { name: names[status.turn] }) });
  }

  const reason = (() => {
    if (status.kind !== "finished") return null;
    switch (status.reason) {
      case "target": return t("dots.end.reasonTarget", { count: state.targetCaptures ?? 0 });
      case "board-full": return t("dots.end.reasonBoardFull");
      case "agreed": return t("dots.end.reasonAgreed");
      case "resigned": return t("dots.end.reasonResigned", { player: seatName(setup, status.winner === 0 ? 1 : 0) });
      default: return null;
    }
  })();

  // Leaving puts the game down for good, as in Star Battle and Chess.
  const exit = () => {
    controller.abandon();
    navigate(href());
  };

  // The score and the status: at the head of the panel on a desktop, above the board on a phone.
  const scoreboard = (
    <DotsScoreboard
      sides={[
        { name: names[0], captures: state.captures[0], active: status.kind === "playing" && status.turn === 0 },
        { name: names[1], captures: state.captures[1], active: status.kind === "playing" && status.turn === 1 }
      ]}
      statusLine={statusLine}
      finished={finished}
      reason={reason}
      top={phone}
    />
  );

  return (
    <>
      <GameStage
        className="dots-stage"
        title={t("games.dots.name")}
        board={<DotsBoard state={state} onPlace={controller.place} disabled={!controller.humanToMove} />}
        score={scoreboard}
        log={<Comms lines={lines} />}
        actions={
          <>
            {!finished && (
              <>
                <Button variant="secondary" onClick={controller.undo} disabled={state.moves.length === 0 || controller.thinking}>
                  <Undo2 size={16} aria-hidden="true" /> {t("dots.undo")}
                </Button>
                <Button variant="secondary" onClick={() => setPending("end")} disabled={state.moves.length === 0}>
                  <Flag size={16} aria-hidden="true" /> {t("dots.endGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moves.length === 0 ? controller.abandon() : setPending("new"))}>
                  <RotateCcw size={16} aria-hidden="true" /> {t("dots.newGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moves.length === 0 ? exit() : setPending("exit"))}>
                  <LogOut size={16} aria-hidden="true" /> {t("dots.exit")}
                </Button>
              </>
            )}
            {finished && (
              <>
                <Button variant="primary" onClick={() => controller.start(setup)}>{t("dots.end.again")}</Button>
                <Button variant="secondary" onClick={controller.abandon}>{t("dots.end.change")}</Button>
                <Button variant="secondary" onClick={exit}>
                  <LogOut size={16} aria-hidden="true" /> {t("dots.end.toLobby")}
                </Button>
              </>
            )}
          </>
        }
      />

      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={t("dots.end.scoreLine", {
            blueName: seatName(setup, 0), blue: state.captures[0], red: state.captures[1], redName: seatName(setup, 1)
          })}
          reason={reason}
          primary={{ label: t("dots.end.again"), onClick: () => controller.start(setup) }}
          secondary={{ label: t("dots.end.toLobby"), onClick: exit }}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {pending === "end" && (
        <Dialog
          title={t("dots.confirmEnd.title")}
          confirmLabel={t("dots.confirmEnd.confirm")}
          cancelLabel={t("dots.confirmEnd.cancel")}
          onConfirm={() => { controller.end(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("dots.confirmEnd.body")}
        </Dialog>
      )}
      {pending === "exit" && (
        <Dialog
          title={t("dots.confirmExit.title")}
          confirmLabel={t("dots.confirmExit.confirm")}
          cancelLabel={t("dots.confirmExit.cancel")}
          danger
          onConfirm={() => { setPending(null); exit(); }}
          onClose={() => setPending(null)}
        >
          {t("dots.confirmExit.body")}
        </Dialog>
      )}
      {pending === "new" && (
        <Dialog
          title={t("dots.confirmNew.title")}
          confirmLabel={t("dots.confirmNew.confirm")}
          cancelLabel={t("dots.confirmNew.cancel")}
          danger
          onConfirm={() => { controller.abandon(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("dots.confirmNew.body")}
        </Dialog>
      )}
    </>
  );
}

function PageHead({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <header className="page-head page-head-row">
      <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
        <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
      </a>
      <h1>{title}</h1>
    </header>
  );
}
