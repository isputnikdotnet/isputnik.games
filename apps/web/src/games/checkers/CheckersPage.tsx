import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkers, Checkers, type CheckersMove, type AiLevel } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { GameStage } from "../../shared/GameStage";
import { Dialog } from "../../shared/Dialog";
import { useComputerResult } from "../../shared/useComputerResult";
import { newGameKey } from "../../shared/gameKey";
import { follow, href } from "../../router";
import { CheckersTable } from "./CheckersTable";
import { CheckersNewGameForm } from "./NewGameForm";
import { Comms } from "../../shared/Comms";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { ChessSettingsDialog } from "../chess/SettingsDialog";
import { ArrowLeft, Settings2, Undo2, Repeat2, Flag, RotateCcw, Handshake } from "lucide-react";
import { loadCheckersSetup, loadCheckersGame, saveGame, type CheckersSetup, type SavedGame } from "./storage";

const NO_MOVES: CheckersMove[] = [];

export function CheckersPage() {
  const { t } = useTranslation();
  const [game, setGame] = useState<SavedGame | null>(loadCheckersGame);
  const [setup, setSetup] = useState<CheckersSetup>(() => game?.setup ?? loadCheckersSetup());
  const [settings, setSettings] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState<"new" | "resign" | "draw" | null>(null);
  const status = game?.state.status;
  const computerTurn = Boolean(
    game && game.setup.mode === "computer" && status?.kind === "playing" && status.turn === game.setup.computerPlays
  );
  const commit = (next: SavedGame) => {
    saveGame(next);
    setGame(next);
  };
  const start = () => {
    setDismissed(null);
    commit({ setup, state: Checkers.createGame(), key: newGameKey() });
    setFlipped(false);
  };
  const move = (move: CheckersMove) =>
    setGame((current) => {
      if (!current) return current;
      const next = {
        ...current,
        state: Checkers.applyMove(current.state, move)
      };
      saveGame(next);
      return next;
    });
  useEffect(() => {
    if (!computerTurn || !game) return;
    const timer = window.setTimeout(() => {
      const answer = Checkers.chooseMove(game.state, game.setup.level, Math.random);
      if (answer) move(answer);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [computerTurn, game]);
  const human = game?.setup.computerPlays === 0 ? 1 : 0;
  useComputerResult(
    game && game.setup.mode === "computer" && status?.kind === "finished"
      ? {
          game: "checkers",
          key: game.key,
          level: game.setup.level,
          human,
          winner: status.winner
        }
      : null
  );
  const player = (seat: number) => t(seat === 0 ? "checkers.white" : "checkers.black");
  const undo = () => {
    if (!game || !game.state.moves.length) return;
    let count = game.state.moves.length - 1;
    if (game.setup.mode === "computer" && count % 2 === game.setup.computerPlays && count > 0) count--;
    commit({
      ...game,
      state: Checkers.replay(game.state.moves.slice(0, count))
    });
  };
  const feed = useFeed(checkers, {}, game?.state.moves ?? NO_MOVES);
  useGameSounds(game && localSound("checkers", feed, game.setup.mode === "computer" ? human : null, game.state.status));
  const abandon = () => {
    try {
      localStorage.removeItem("isputnik-games.checkers.local");
    } catch {
      /* private mode */
    }
    setGame(null);
  };
  if (!game)
    return (
      <section className="chess-page">
        <header className="page-head page-head-row">
          <a className="text-link" href={href()} onClick={(e) => follow(e, href())}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("app.allGames")}
          </a>
          <h1>{t("games.checkers.name")}</h1>
        </header>
        <CheckersNewGameForm setup={setup} onChange={setSetup} onStart={start} />
      </section>
    );
  const line =
    status?.kind === "finished"
      ? status.winner === null
        ? t("checkers.draw")
        : t("checkers.winner", { player: player(status.winner) })
      : computerTurn
        ? t("checkers.thinking")
        : t("checkers.turn", {
            player: player(status?.kind === "playing" ? status.turn : 0)
          });
  const facing = game.setup.mode === "computer" ? human : status?.kind === "playing" ? status.turn : 0;
  return (
    <>
      <GameStage
        className="chess-stage checkers-stage"
        title={t("games.checkers.name")}
        board={
          <CheckersTable
            names={[player(0), player(1)]}
            state={game.state}
            movable={status?.kind === "playing" && !computerTurn ? status.turn : null}
            orientation={flipped ? (facing === 0 ? 1 : 0) : facing}
            onMove={move}
          />
        }
        score={
          <div>
            <p className="checkers-status" role="status">
              {line}
            </p>
            <p className="muted">{t("checkers.variant")}</p>
            <div className="checkers-counts">
              {([0, 1] as const).map((seat) => (
                <span key={seat}>
                  {player(seat)} · {game.state.board.filter((p) => p?.player === seat).length}
                </span>
              ))}
            </div>
          </div>
        }
        log={
          <Comms
            lines={feed.map((event, i) => ({
              key: String(i),
              kind: "event",
              who: event.by === human ? "you" : "them",
              name: player(event.by),
              text: String(event.notation)
            }))}
          />
        }
        actions={
          <>
            <Button onClick={() => setSettings(true)}>
              <Settings2 size={16} aria-hidden="true" />
              {t("chess.settings.open")}
            </Button>
            <Button onClick={undo} disabled={!game.state.moves.length || computerTurn}>
              <Undo2 size={16} aria-hidden="true" />
              {t("checkers.undo")}
            </Button>
            <Button onClick={() => setFlipped(!flipped)}>
              <Repeat2 size={16} aria-hidden="true" />
              {t("checkers.flip")}
            </Button>
            {status?.kind === "playing" && (
              <>
                <Button onClick={() => setPending("resign")}>
                  <Flag size={16} aria-hidden="true" />
                  {t("checkers.resign")}
                </Button>
                {game.setup.mode === "local" && (
                  <Button onClick={() => setPending("draw")}>
                    <Handshake size={16} aria-hidden="true" />
                    {t("checkers.agreeDraw")}
                  </Button>
                )}
              </>
            )}
            <Button
              onClick={() => (status?.kind === "playing" && game.state.moves.length ? setPending("new") : abandon())}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t("checkers.new")}
            </Button>
          </>
        }
      />
      {settings && (
        <ChessSettingsDialog<AiLevel>
          onClose={() => setSettings(false)}
          level={
            game.setup.mode === "computer" && status?.kind === "playing"
              ? {
                  label: t("chess.setup.level"),
                  value: game.setup.level,
                  options: (["easy", "normal", "hard"] as const).map((value) => ({
                    value,
                    label: t(
                      (
                        {
                          easy: "chess.setup.levelEasy",
                          normal: "chess.setup.levelNormal",
                          hard: "chess.setup.levelHard"
                        } as const
                      )[value]
                    )
                  })),
                  onChange: (level) => {
                    setSetup({ ...game.setup, level });
                    commit({ ...game, setup: { ...game.setup, level } });
                  }
                }
              : undefined
          }
        />
      )}
      {status?.kind === "finished" && dismissed !== game.key + game.state.moves.length + status.reason && (
        <GameOverDialog
          headline={line}
          scoreLine={t("chess.end.moves", {
            count: Math.ceil(game.state.moves.length / 2)
          })}
          reason={
            status.reason === "board-full"
              ? t("checkers.noMoves")
              : status.reason === "repetition"
                ? t("checkers.repetition")
                : null
          }
          primary={{
            label: t("chess.end.again"),
            onClick: () => {
              setDismissed(null);
              commit({
                ...game,
                key: newGameKey(),
                state: Checkers.createGame()
              });
            }
          }}
          secondary={{ label: t("chess.end.change"), onClick: abandon }}
          onClose={() => setDismissed(game.key + game.state.moves.length + status.reason)}
        />
      )}
      {pending && (
        <Dialog
          title={t(`checkers.confirm.${pending}`)}
          confirmLabel={t("checkers.confirm.yes")}
          cancelLabel={t("checkers.confirm.no")}
          onClose={() => setPending(null)}
          onConfirm={() => {
            if (pending === "new") abandon();
            else
              commit({
                ...game,
                state: Checkers.finish(
                  game.state,
                  pending === "draw" ? "agreed" : "resigned",
                  game.setup.mode === "computer"
                    ? human
                    : game.state.status.kind === "playing"
                      ? game.state.status.turn
                      : 0
                )
              });
            setPending(null);
          }}
        >
          {t("checkers.confirm.body")}
        </Dialog>
      )}
    </>
  );
}
