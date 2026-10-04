import { getAnthropicClient, isLiveModeAvailable, MODEL } from "./client";

const SYSTEM_PROMPT = `You split Islamic-content text into discrete, checkable factual or religious claims.

Rules:
- Each claim must be a single, self-contained statement that could be checked against a source.
- Do not merge multiple distinct claims into one.
- Do not add claims that are not present in the text. Do not invent religious content.
- Skip greetings, pleasantries, and pure opinion/emotion statements with no checkable content.
- Preserve the claim's original meaning; do not editorialize or add qualifiers.
- Output 1 to 8 claims. If the text contains no checkable claims, output an empty list.`;

const CLAIMS_SCHEMA = {
  type: "object" as const,
  properties: {
    claims: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Discrete, checkable claims extracted from the text, in order of appearance.",
    },
  },
  required: ["claims"],
  additionalProperties: false,
};

function heuristicExtract(text: string): string[] {
  return text
    .split(/(?<=[.!?؟۔])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .filter((s) => !/^(hi|hello|salam|assalam|dear|thanks|thank you)/i.test(s))
    .slice(0, 8);
}

export async function extractClaims(
  text: string
): Promise<{ claims: string[]; mode: "live" | "demo" }> {
  if (!isLiveModeAvailable()) {
    return { claims: heuristicExtract(text), mode: "demo" };
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: CLAIMS_SCHEMA },
      },
      messages: [{ role: "user", content: text }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { claims: heuristicExtract(text), mode: "demo" };
    }
    const parsed = JSON.parse(block.text) as { claims: string[] };
    const claims = (parsed.claims ?? []).map((c) => c.trim()).filter(Boolean);
    return { claims, mode: "live" };
  } catch {
    return { claims: heuristicExtract(text), mode: "demo" };
  }
}
