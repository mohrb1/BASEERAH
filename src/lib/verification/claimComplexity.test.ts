import { describe, expect, it } from "vitest";
import { detectClaimComplexity, isComplexClaim } from "./claimComplexity";

describe("detectClaimComplexity", () => {
  it("flags negation", () => {
    expect(detectClaimComplexity("Prayer is not required if you are traveling.").negation).toBe(true);
    expect(detectClaimComplexity("Fasting is obligatory in Ramadan.").negation).toBe(false);
  });

  it("flags universal/absolute wording", () => {
    expect(detectClaimComplexity("Everyone who fasts enters Paradise.").universal).toBe(true);
    expect(detectClaimComplexity("Fasting Ramadan guarantees Paradise no matter what.").absolute).toBe(true);
    expect(detectClaimComplexity("Some Muslims fast on Mondays.").universal).toBe(false);
  });

  it("flags numerical claims", () => {
    expect(detectClaimComplexity("The scholar predicted the year 2090.").numerical).toBe(true);
    expect(detectClaimComplexity("Pray five times a day.").numerical).toBe(true);
    expect(detectClaimComplexity("Prayer is important.").numerical).toBe(false);
  });

  it("flags causal claims", () => {
    expect(detectClaimComplexity("Sins are forgiven because you fasted.").causal).toBe(true);
    expect(detectClaimComplexity("Fasting leads to forgiveness.").causal).toBe(true);
  });

  it("flags multi-condition claims", () => {
    expect(detectClaimComplexity("If you fast and pray and give charity, you succeed.").multiCondition).toBe(true);
    expect(detectClaimComplexity("Unless you repent, the sin remains.").multiCondition).toBe(true);
  });

  it("flags speculative/predictive claims", () => {
    expect(detectClaimComplexity("A famous scholar predicted the Day of Judgment will happen in 2090.").speculative).toBe(true);
    expect(detectClaimComplexity("The Quran describes the Day of Judgment.").speculative).toBe(false);
  });

  it("does not flag a simple, unqualified claim as complex", () => {
    const flags = detectClaimComplexity("The Prophet taught that actions are judged by intentions.");
    expect(isComplexClaim(flags)).toBe(false);
  });

  it("isComplexClaim is true when any disqualifying flag is set", () => {
    expect(isComplexClaim({ negation: true, universal: false, absolute: false, numerical: false, causal: false, multiCondition: false, speculative: false })).toBe(true);
    expect(isComplexClaim({ negation: false, universal: false, absolute: false, numerical: false, causal: false, multiCondition: false, speculative: true })).toBe(false);
  });
});
