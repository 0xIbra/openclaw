import { describe, expect, it } from "vitest";
import { containsSecrets, scrubText } from "./scrub-middleware.js";

describe("scrub middleware", () => {
  it("redacts built-in secret patterns in one-shot mode", () => {
    const input = "token=sk-proj-abc123456789xyz000111222333";
    const output = scrubText(input, { context: "prompt" });
    expect(output).toContain("[REDACTED:");
    expect(output).not.toContain("sk-proj-abc123456789xyz000111222333");
  });

  it("detects built-in secret patterns in one-shot mode", () => {
    expect(
      containsSecrets("ghp_abc123456789abc123456789abc12345678", { context: "terminal" }),
    ).toBe(true);
  });
});
