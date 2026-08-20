import { describe, expect, test } from "bun:test";
import { cronError, describeCron, relativeTime } from "./cron";
import { CRON_PRESETS, DEFAULT_CRON } from "./spec";

describe("cronError", () => {
  test("accepts the shapes we offer and the ones people type", () => {
    for (const expr of ["0 9 * * 1", "0 9 * * *", "0 9 1 * *", "0 */6 * * *", "*/15 * * * *", "30 2 * * 1-5", "0 0 1 1 *"]) {
      expect(cronError(expr)).toBeNull();
    }
  });

  test("every preset we ship is valid", () => {
    for (const p of CRON_PRESETS) expect(cronError(p.cron)).toBeNull();
    expect(cronError(DEFAULT_CRON)).toBeNull();
  });

  test("rejects the wrong number of fields", () => {
    expect(cronError("0 9 * *")).toContain("five fields");
    expect(cronError("0 9 * * 1 2")).toContain("five fields");
    expect(cronError("")).toContain("five fields");
  });

  test("rejects out-of-range values, naming the field", () => {
    expect(cronError("60 9 * * 1")).toContain("minute must be 0–59");
    expect(cronError("0 24 * * 1")).toContain("hour must be 0–23");
    expect(cronError("0 9 32 * *")).toContain("day of month must be 1–31");
    expect(cronError("0 9 * 13 *")).toContain("month must be 1–12");
  });

  test("rejects junk, backwards ranges and a zero step", () => {
    expect(cronError("x 9 * * 1")).toContain("not a number");
    expect(cronError("0 17-9 * * *")).toContain("backwards");
    expect(cronError("*/0 * * * *")).toContain("not a usable step");
  });
});

describe("describeCron", () => {
  test("reads the presets back in English", () => {
    expect(describeCron("0 9 * * 1")).toBe("Every Monday at 09:00 UTC");
    expect(describeCron("0 9 * * *")).toBe("Every day at 09:00 UTC");
    expect(describeCron("0 9 1 * *")).toBe("Monthly, on the 1st at 09:00 UTC");
    expect(describeCron("0 */6 * * *")).toBe("Every 6 hours, at 00 past");
  });

  test("handles day ranges and lists", () => {
    expect(describeCron("30 2 * * 1-5")).toBe("Every weekday at 02:30 UTC");
    expect(describeCron("0 9 * * 1,4")).toBe("Every Monday and Thursday at 09:00 UTC");
    expect(describeCron("0 9 * * 0-6")).toBe("Every day at 09:00 UTC");
  });

  test("ordinals read correctly", () => {
    expect(describeCron("0 9 2 * *")).toContain("2nd");
    expect(describeCron("0 9 3 * *")).toContain("3rd");
    expect(describeCron("0 9 11 * *")).toContain("11th");
    expect(describeCron("0 9 21 * *")).toContain("21st");
  });

  test("falls back to the raw expression rather than lying", () => {
    expect(describeCron("0 9 1-7 * 1")).toBe("0 9 1-7 * 1");
    expect(describeCron("nonsense")).toBe("nonsense");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");

  test("past and future read differently", () => {
    expect(relativeTime("2026-08-20T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-08-20T15:00:00Z", now)).toBe("in 3 hours");
    expect(relativeTime("2026-08-13T12:00:00Z", now)).toBe("1 week ago");
  });

  test("a schedule that has never run says so", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime("not a date", now)).toBe("unknown");
  });
});

describe("the credential never leaks into the prompt", () => {
  test("the rendered system prompt names the variable, never a value", async () => {
    const { systemPrompt, vaultName, TOKEN_KEY } = await import("./spec");
    const p = systemPrompt({ host: "github.com", owner: "o", name: "r" });
    expect(p).toContain("$GITHUB_TOKEN@github.com/o/r.git");
    expect(p).toContain("never print it");
    expect(p).toContain("never echo a command with it expanded");
    // The prompt is generated from a ref alone, so there is nowhere for a real
    // token to enter it — assert the only occurrences are the shell variable.
    const occurrences = p.split(TOKEN_KEY).length - 1;
    expect(occurrences).toBeGreaterThan(0);
    expect(p).not.toMatch(/gh[ps]_[A-Za-z0-9]{16,}/);
    expect(vaultName({ host: "github.com", owner: "o", name: "r" })).toBe("Rounds: github.com/o/r");
  });
});
