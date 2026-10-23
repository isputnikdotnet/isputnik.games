import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Comms } from "../src/shared/Comms";
import { withTalk, type CommsLine } from "../src/shared/commsLines";

const events: CommsLine[] = [
  { key: "e0", kind: "event", who: "you", name: "You", text: "fire H8", result: { text: "HIT", tone: "good" } },
  { key: "e1", kind: "event", who: "you", name: "You", text: "fire H9", result: { text: "MISS", tone: "neutral" } },
  { key: "e2", kind: "event", who: "them", name: "Dad", text: "fire A1", result: { text: "MISS", tone: "neutral" } }
];

describe("Comms", () => {
  it("gives a long name its first word, the whole one in the tooltip", () => {
    render(<Comms lines={[{ key: "e0", kind: "event", who: "them", name: "Sergey Mikhalchenko", text: "dot 10,9" }]} onSend={() => {}} sendTo="Sergey Mikhalchenko" />);
    const name = screen.getByTitle("Sergey Mikhalchenko");
    expect(name).toHaveTextContent(/^■ Sergey$/);
    expect(screen.getByPlaceholderText("message Sergey…")).toBeInTheDocument();
  });

  it("slots what was said after the move it was said after", () => {
    const lines = withTalk(events, [
      { id: 1, by: 1, text: "lucky", afterMove: 1 },
      { id: 2, by: 0, text: "gg", afterMove: 3 }
    ], (seat) => (seat === 0 ? { who: "you", name: "You" } : { who: "them", name: "Dad" }));
    expect(lines.map((line) => line.key)).toEqual(["e0", "say-1", "e1", "e2", "say-2"]);
    expect(lines[1]).toMatchObject({ kind: "say", who: "them", name: "Dad", text: "lucky" });
  });

  it("shows the lines and, online, takes a typed line or a tapped phrase", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Comms lines={[...events, { key: "s", kind: "system", text: "your move" }]} onSend={onSend} phrases={["good game", "rematch?"]} sendTo="Dad" />);
    const log = screen.getByRole("log");
    expect(within(log).getAllByText("MISS")).toHaveLength(2);
    expect(log).toHaveTextContent("— your move");

    const input = screen.getByPlaceholderText("message Dad…");
    await user.type(input, "  nice shot {enter}");
    expect(onSend).toHaveBeenCalledWith("nice shot");
    expect(input).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "rematch?" }));
    expect(onSend).toHaveBeenLastCalledWith("rematch?");
  });

  it("is a log only without a sender", () => {
    render(<Comms lines={events} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
