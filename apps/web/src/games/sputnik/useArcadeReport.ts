import { useEffect, useState } from "react";
import { ApiError, reportArcadeScore, type ArcadeScoreAnswer } from "../../api";
import { useSession } from "../../session";

/** What a finished run of any arcade game hands over to be reported. */
export interface ReportableRun {
  key: string;
  variant: string;
  seed: number;
  log: [number, unknown][];
}

export type ReportState =
  | { status: "saving" }
  | { status: "saved"; answer: ArcadeScoreAnswer }
  /** The server could not be reached: the run is kept and goes later. */
  | { status: "waiting" }
  | { status: "failed" };

// A finished run goes to the server for the family's board as its seed and
// input log; the server replays it and answers with the score it came to and
// the member's best across devices. A run that cannot be sent (offline) waits
// on the device and goes when the server is next reached (outbox.ts). A guest's
// runs are not the family's.
export function useArcadeReport(game: string, run: ReportableRun | null): ReportState | null {
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
      (error: unknown) => live && setReport({ key, state: { status: error instanceof ApiError && error.status !== 401 && error.status < 500 ? "failed" : "waiting" } })
    );
    return () => {
      live = false;
    };
    // The key names the run: nothing else about it changes once it is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && report?.key === key ? report.state : null;
}
