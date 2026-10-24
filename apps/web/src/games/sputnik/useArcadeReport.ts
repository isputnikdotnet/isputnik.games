import { useEffect, useState } from "react";
import { reportArcadeScore, type ArcadeScoreAnswer } from "../../api";
import { useSession } from "../../session";
import type { FinishedRun } from "./useArcadeRun";

export type ReportState =
  | { status: "saving" }
  | { status: "saved"; answer: ArcadeScoreAnswer }
  | { status: "failed" };

// A finished run goes to the server for the family's board as its seed and
// input log; the server replays it and answers with the score it came to and
// the member's best across devices. One try: a run is not kept on the device,
// so one that fails to send (offline) is the device's best only. A guest's
// runs are not the family's.
export function useArcadeReport(game: string, run: FinishedRun | null): ReportState | null {
  const session = useSession();
  const member = session.status === "ready" && session.user.role !== "guest";
  const [report, setReport] = useState<{ key: string; state: ReportState } | null>(null);
  const key = run && member ? run.key : null;

  useEffect(() => {
    if (!run || !key) return;
    let live = true;
    setReport({ key, state: { status: "saving" } });
    reportArcadeScore({ game, variant: run.variant, seed: run.seed, key, log: run.log }).then(
      (answer) => live && setReport({ key, state: { status: "saved", answer } }),
      () => live && setReport({ key, state: { status: "failed" } })
    );
    return () => {
      live = false;
    };
    // The key names the run: nothing else about it changes once it is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && report?.key === key ? report.state : null;
}
