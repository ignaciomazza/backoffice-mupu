import { describe, expect, it } from "vitest";
import { getBillingConfig, parseRetryDaysEnv } from "@/lib/billingConfig";

describe("billingConfig", () => {
  it("parses retry days from BILLING_DUNNING_RETRY_DAYS", () => {
    expect(parseRetryDaysEnv("2,4")).toEqual([2, 4]);
    expect(parseRetryDaysEnv("4, 2, 2, x, -1")).toEqual([2, 4]);
    expect(parseRetryDaysEnv("")).toEqual([]);
  });

  it("uses defaults when env is missing", () => {
    const prev = process.env.BILLING_DUNNING_RETRY_DAYS;
    delete process.env.BILLING_DUNNING_RETRY_DAYS;

    const cfg = getBillingConfig();
    expect(cfg.dunningRetryDays).toEqual([2, 4]);

    process.env.BILLING_DUNNING_RETRY_DAYS = prev;
  });
});
