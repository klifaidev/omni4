import { describe, expect, it } from "vitest";
import { buildRendererErrorPayload } from "./rendererErrorReporting";

describe("buildRendererErrorPayload", () => {
  it("includes source, message, stack and route context", () => {
    window.location.hash = "#/slides";
    const error = new Error("boom");
    const payload = buildRendererErrorPayload("react.error-boundary", error, "component stack");

    expect(payload.source).toBe("react.error-boundary");
    expect(payload.message).toBe("boom");
    expect(payload.stack).toContain("boom");
    expect(payload.componentStack).toBe("component stack");
    expect(payload.context.route).toBe("#/slides");
    expect(payload.context.href).toContain("#/slides");
    expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
