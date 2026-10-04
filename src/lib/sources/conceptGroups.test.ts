import { describe, expect, it } from "vitest";
import { tokenize } from "./textUtils";
import { evaluateConceptCoverage } from "./conceptGroups";

function tokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

describe("evaluateConceptCoverage", () => {
  it("does not invoke any concept group for an unrelated claim", () => {
    const result = evaluateConceptCoverage(
      tokens("The sky is blue on a clear day."),
      tokens("Some evidence text about something else entirely.")
    );
    expect(result.anchorInvoked).toBe(false);
    expect(result.confirmed).toBe(false);
  });

  it("confirms a genuine five-pillars match (multiple related concepts present)", () => {
    const claim = "The pillars of Islam are five.";
    const evidence =
      "Islam is raised on five pillars: the oneness of Allah, establishment of prayer, payment of Zakat, fast of Ramadan, and Pilgrimage to the House.";
    const result = evaluateConceptCoverage(tokens(claim), tokens(evidence));
    expect(result.anchorInvoked).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(result.relatedMatches).toBeGreaterThanOrEqual(2);
  });

  it("does NOT confirm when evidence only shares the bare anchor word (architectural pillars)", () => {
    const claim = "The pillars of Islam are five.";
    const evidence = "He prayed two rak'at between the two pillars inside the building.";
    const result = evaluateConceptCoverage(tokens(claim), tokens(evidence));
    expect(result.anchorInvoked).toBe(true);
    // Only "prayer"-adjacent wording might appear, never enough distinct concepts.
    expect(result.confirmed).toBe(false);
  });

  it("CRITICAL SAFETY: a source containing only the word 'pillars' is never confirmed", () => {
    const claim = "The five pillars of Islam.";
    const evidence = "Of Eram, who had lofty pillars, the like of which were never built in any city.";
    const result = evaluateConceptCoverage(tokens(claim), tokens(evidence));
    expect(result.anchorInvoked).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.relatedMatches).toBe(0);
  });

  it("does not invoke the concept group when the claim never mentions pillars at all", () => {
    const result = evaluateConceptCoverage(
      tokens("Zakat is 2.5% of savings."),
      tokens("Islam is raised on five pillars: prayer, zakat, fasting, pilgrimage.")
    );
    expect(result.anchorInvoked).toBe(false);
  });

  it("works for the Arabic anchor term أركان", () => {
    const claim = "أركان الإسلام خمسة";
    const evidence = "الإسلام يقوم على خمسة أركان: الصلاة والزكاة والصوم والحج والشهادتان";
    const result = evaluateConceptCoverage(tokens(claim), tokens(evidence));
    expect(result.anchorInvoked).toBe(true);
  });

  it("requires multiple distinct related concepts, not just one repeated", () => {
    // Evidence mentions "prayer" three times but no other pillar concept — still unconfirmed.
    const claim = "The pillars of Islam.";
    const evidence = "Prayer, prayer, and more prayer near the old pillars.";
    const result = evaluateConceptCoverage(tokens(claim), tokens(evidence));
    expect(result.confirmed).toBe(false);
    expect(result.relatedMatches).toBe(1);
  });
});
