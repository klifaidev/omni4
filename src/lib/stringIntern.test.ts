import { describe, expect, it } from "vitest";
import { createStringInterner, internTrimmed } from "./stringIntern";

describe("string interning", () => {
  it("reuses equal normalized values inside the same parse scope", () => {
    const intern = createStringInterner();
    const first = internTrimmed("  ESPECIALIZADO  ", intern);
    const second = internTrimmed("ESPECIALIZADO", intern);

    expect(first).toBe("ESPECIALIZADO");
    expect(second).toBe(first);
  });

  it("does not share state between parse scopes", () => {
    const one = createStringInterner();
    const two = createStringInterner();

    expect(internTrimmed("Chocolate", one)).toBe(internTrimmed("Chocolate", two));
  });
});
