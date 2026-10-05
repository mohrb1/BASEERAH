import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockExtractClaims = vi.fn();
const mockVerifyClaim = vi.fn();

vi.mock("@/lib/ai/extractClaims", () => ({
  extractClaims: (text: string) => mockExtractClaims(text),
}));

vi.mock("@/lib/verification/verify", () => ({
  verifyClaim: (claimText: string, index: number, idPrefix: string) =>
    mockVerifyClaim(claimText, index, idPrefix),
}));

const { POST } = await import("./route");

beforeEach(() => {
  mockExtractClaims.mockReset();
  mockVerifyClaim.mockReset();
});

function postRequest(bodyObj: unknown): NextRequest {
  // Mirrors exactly what the browser's fetch(..., { body: JSON.stringify(...) })
  // sends: a UTF-8 encoded JSON string body with a JSON content-type header.
  return new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

describe("POST /api/analyze — Arabic text reaches the handler without corruption", () => {
  it("passes the exact Arabic claim text to extractClaims, byte-for-byte", async () => {
    const claim = "أركان الإسلام خمسة";
    mockExtractClaims.mockResolvedValue({ claims: [claim], mode: "demo" });
    mockVerifyClaim.mockResolvedValue({
      id: "claim-0",
      index: 0,
      claimText: claim,
      status: "SUPPORTED",
      explanation: "test",
      evidence: [],
    });

    const res = await POST(postRequest({ text: claim, inputType: "text" }));
    expect(res.status).toBe(200);

    expect(mockExtractClaims).toHaveBeenCalledWith(claim);
    const receivedText = mockExtractClaims.mock.calls[0][0] as string;
    expect(receivedText).toBe(claim);
    expect([...receivedText].map((c) => c.codePointAt(0))).toEqual(
      [...claim].map((c) => c.codePointAt(0))
    );
  });

  it("passes the exact Arabic claim text through to verifyClaim as well", async () => {
    const claim = "الصلاة من أركان الإسلام";
    mockExtractClaims.mockResolvedValue({ claims: [claim], mode: "demo" });
    mockVerifyClaim.mockResolvedValue({
      id: "claim-0",
      index: 0,
      claimText: claim,
      status: "NEEDS_CONTEXT",
      explanation: "test",
      evidence: [],
    });

    await POST(postRequest({ text: claim, inputType: "text" }));
    expect(mockVerifyClaim).toHaveBeenCalledWith(claim, 0, expect.any(String));
  });

  it("round-trips the Arabic text into the JSON response's originalText field unmodified", async () => {
    const claim = "الزكاة من أركان الإسلام";
    mockExtractClaims.mockResolvedValue({ claims: [claim], mode: "demo" });
    mockVerifyClaim.mockResolvedValue({
      id: "claim-0",
      index: 0,
      claimText: claim,
      status: "SUPPORTED",
      explanation: "test",
      evidence: [],
    });

    const res = await POST(postRequest({ text: claim, inputType: "text" }));
    const json = await res.json();
    expect(json.originalText).toBe(claim);
    expect(json.claims[0].claimText).toBe(claim);
  });
});
