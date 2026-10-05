import { describe, expect, it } from "vitest";
import { classifyInput } from "./classifyInput";

describe("classifyInput", () => {
  it("classifies empty/whitespace-only input as UNCLEAR", () => {
    expect(classifyInput("").kind).toBe("UNCLEAR");
    expect(classifyInput("   ").kind).toBe("UNCLEAR");
  });

  it("classifies a plain declarative Arabic claim as CLAIM", () => {
    expect(classifyInput("أركان الإسلام خمسة").kind).toBe("CLAIM");
    expect(classifyInput("الأعمال بالنيات").kind).toBe("CLAIM");
  });

  it("classifies a plain declarative English claim as CLAIM", () => {
    expect(classifyInput("The Prophet taught that actions are judged by intentions.").kind).toBe(
      "CLAIM"
    );
  });

  it("recognizes an Arabic question ending in '؟' as QUESTION", () => {
    const result = classifyInput("ما هي أركان الإسلام؟");
    expect(result.kind).toBe("QUESTION");
  });

  it("derives a retrieval intent that strips the interrogative wrapper, never altering what's shown", () => {
    const result = classifyInput("ما هي أركان الإسلام؟");
    expect(result.retrievalIntent).toBe("أركان الإسلام");
  });

  it("recognizes 'هل' yes/no questions", () => {
    const result = classifyInput("هل الزكاة من أركان الإسلام؟");
    expect(result.kind).toBe("QUESTION");
  });

  it("recognizes an English question ending in '?'", () => {
    expect(classifyInput("What are the pillars of Islam?").kind).toBe("QUESTION");
  });

  it("does not misclassify a claim that merely contains 'من' mid-sentence as a question", () => {
    expect(classifyInput("الزكاة من أركان الإسلام").kind).toBe("CLAIM");
    expect(classifyInput("الصلاة من أركان الإسلام").kind).toBe("CLAIM");
  });

  it("never alters the original text — classification is read-only", () => {
    const original = "ما هي أركان الإسلام؟";
    classifyInput(original);
    expect(original).toBe("ما هي أركان الإسلام؟");
  });
});
