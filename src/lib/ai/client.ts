import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

export function isLiveModeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export { MODEL };
