import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import * as api from "../src/api";
import { useComputerResult, type ComputerGameEnd } from "../src/shared/useComputerResult";

vi.mock("../src/api", async (original) => ({
  ...(await original<typeof import("../src/api")>()),
  reportComputerResult: vi.fn()
}));

const ended = (key: string, winner: ComputerGameEnd["winner"]): ComputerGameEnd => ({ game: "chess", key, level: "hard", human: 0, winner });

describe("reporting a game against the computer", () => {
  beforeEach(() => {
    vi.mocked(api.reportComputerResult).mockReset();
    vi.mocked(api.reportComputerResult).mockResolvedValue({ recorded: true });
  });

  it("sends nothing while the game is on, then the result once, from the person's side", () => {
    const { rerender } = renderHook(({ end }) => useComputerResult(end), { initialProps: { end: null as ComputerGameEnd | null } });
    expect(api.reportComputerResult).not.toHaveBeenCalled();
    rerender({ end: ended("key-won-0001", 0) });
    rerender({ end: ended("key-won-0001", 0) });
    expect(api.reportComputerResult).toHaveBeenCalledTimes(1);
    expect(api.reportComputerResult).toHaveBeenCalledWith({ game: "chess", level: "hard", result: "won", key: "key-won-0001" });
  });

  it("calls a loss and a draw by name", () => {
    renderHook(() => useComputerResult(ended("key-lost-0001", 1)));
    renderHook(() => useComputerResult(ended("key-draw-0001", null)));
    expect(vi.mocked(api.reportComputerResult).mock.calls.map(([body]) => body.result)).toEqual(["lost", "drawn"]);
  });

  it("tries again when the finished game is opened again after a failed send", async () => {
    vi.mocked(api.reportComputerResult).mockRejectedValueOnce(new Error("offline"));
    const first = renderHook(() => useComputerResult(ended("key-retry-001", 0)));
    await Promise.resolve();
    await Promise.resolve();
    first.unmount();
    renderHook(() => useComputerResult(ended("key-retry-001", 0)));
    expect(api.reportComputerResult).toHaveBeenCalledTimes(2);
  });
});
