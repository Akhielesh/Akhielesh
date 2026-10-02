import { describe, expect, it } from "vitest";
import { analyzeEmail } from "../src/server/intel/analyze.js";
import { FIXTURES } from "./fixtures/emails.js";

const opts = { currency: "USD", timeZone: "America/New_York" };

describe("analyzeEmail fixtures", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const result = analyzeEmail(fixture.email, opts);
      const context = `${fixture.name}: ${result.category}/${result.subtype} vendor=${result.vendor?.slug} amount=${result.primaryAmount?.amount} reasons=${result.reasons.join("; ")} summary=${result.summary}`;
      expect(result.category, context).toBe(fixture.expect.category);
      if (fixture.expect.subtype) expect(result.subtype, context).toBe(fixture.expect.subtype);
      if (fixture.expect.vendor !== undefined) expect(result.vendor?.slug ?? null, context).toBe(fixture.expect.vendor);
      if (fixture.expect.amount !== undefined) expect(result.primaryAmount?.amount, context).toBe(fixture.expect.amount);
      if (fixture.expect.currency) expect(result.primaryAmount?.currency, context).toBe(fixture.expect.currency);
      if (fixture.expect.cycle) expect(result.cycle, context).toBe(fixture.expect.cycle);
      if (fixture.expect.priceChange) {
        expect(result.priceChange?.from, context).toBe(fixture.expect.priceChange.from);
        expect(result.priceChange?.to, context).toBe(fixture.expect.priceChange.to);
      }
      if (fixture.expect.dateKind) {
        const date = result.dates.find((d) => d.kind === fixture.expect.dateKind);
        expect(date, `${context} dates=${JSON.stringify(result.dates)}`).toBeTruthy();
        if (fixture.expect.date) expect(date!.at.toISOString().slice(0, 10), context).toBe(fixture.expect.date);
      }
      for (const [key, value] of Object.entries(fixture.expect.data ?? {})) {
        expect(result.data[key], `${context} data.${key} in ${JSON.stringify(result.data)}`).toEqual(value);
      }
      expect(result.summary.length).toBeGreaterThan(3);
    });
  }

  it("redacts one-time codes from stored text", () => {
    const fixture = FIXTURES.find((f) => f.name === "Verification code")!;
    const result = analyzeEmail(fixture.email, opts);
    expect(result.cleanText).not.toContain("482913");
    expect(result.snippet).not.toContain("482913");
  });
});
