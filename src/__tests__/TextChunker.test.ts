import { chunkText } from "@/core/infrastructure/knowledge/TextChunker";

describe("chunkText", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const text = "This is a short knowledge base document about our refund policy.";
    const chunks = chunkText(text, { maxChars: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple chunks respecting maxChars", () => {
    const paragraph = "A".repeat(50);
    const text = Array.from({ length: 40 }, () => paragraph).join("\n\n");
    const chunks = chunkText(text, { maxChars: 300, overlapChars: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(300 + 20));
  });

  it("hard-splits a single paragraph that exceeds maxChars on its own", () => {
    const hugeParagraph = "B".repeat(5000);
    const chunks = chunkText(hugeParagraph, { maxChars: 1000, overlapChars: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    // Reassembling without overlap should recover roughly the source length.
    const totalUnique = chunks.reduce((sum, c, i) => sum + (i === 0 ? c.length : c.length - 100), 0);
    expect(totalUnique).toBeGreaterThanOrEqual(hugeParagraph.length - 200);
  });

  it("preserves content across chunk boundaries via overlap", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ${"x".repeat(80)}`).join("\n\n");
    const chunks = chunkText(text, { maxChars: 200, overlapChars: 50 });
    const rejoined = chunks.join(" ");
    expect(rejoined).toContain("Paragraph 0");
    expect(rejoined).toContain("Paragraph 9");
  });
});
