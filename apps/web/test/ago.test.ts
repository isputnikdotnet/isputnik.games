import { describe, expect, it } from "vitest";
import { ago } from "../src/shared/ago";

const now = Date.parse("2026-10-23T18:00:00.000Z");
const before = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;

describe("ago", () => {
  it("says how long ago, in the reader's language", () => {
    expect(ago(before(20_000), "en", now)).toBe("now");
    expect(ago(before(20_000), "ru", now)).toBe("сейчас");
    expect(ago(before(20 * MIN), "en", now)).toBe("20 minutes ago");
    expect(ago(before(3 * 60 * MIN), "en", now)).toBe("3 hours ago");
    expect(ago(before(26 * 60 * MIN), "en", now)).toBe("yesterday");
    expect(ago(before(20 * MIN), "ru", now)).toBe("20 минут назад");
  });

  it("gives the date past a week, and nothing for a bad one", () => {
    expect(ago("2026-10-01T12:00:00.000Z", "en", now)).toBe("Oct 1");
    expect(ago("not a date", "en", now)).toBe("");
  });
});
