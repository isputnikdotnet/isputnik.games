import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
// Boot i18n so components render real English strings for text queries.
import "../src/i18n";

afterEach(cleanup);

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }) as unknown as MediaQueryList;
}

// Nothing in a unit test should reach the network.
globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  throw new Error(`Unmocked fetch to ${String(input)} — mock the api module or stub fetch in this test.`);
}) as unknown as typeof fetch;
