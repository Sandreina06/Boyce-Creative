import { describe, expect, it } from "vitest";
import { isTransient } from "./mcp-transport";

describe("isTransient", () => {
  it("retries rate limits and timeouts but not bad queries", () => {
    expect(isTransient("429 Too Many Requests")).toBe(true);
    expect(isTransient("Request timed out")).toBe(true);
    expect(isTransient("fetch failed")).toBe(true);
    expect(isTransient("the fields you have selected are not compatible with each other")).toBe(false);
    expect(isTransient("Account 1496773465190264 is not available")).toBe(false);
  });
});
