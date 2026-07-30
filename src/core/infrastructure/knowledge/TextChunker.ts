export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

/**
 * Splits text into overlapping chunks on paragraph/sentence boundaries
 * where possible, falling back to a hard character cut. Deterministic and
 * dependency-free, so it's fully unit-testable without any live service —
 * unlike embedding generation, which needs a real API call.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1000;
  const overlapChars = options.overlapChars ?? 150;

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = current.slice(Math.max(0, current.length - overlapChars));
    }

    if (paragraph.length <= maxChars) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      // Paragraph itself exceeds maxChars: hard-split with overlap.
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + maxChars, paragraph.length);
        chunks.push(paragraph.slice(start, end));
        start = end - overlapChars;
        if (start <= 0 || end === paragraph.length) break;
      }
      current = "";
    }
  }

  if (current) chunks.push(current);

  return chunks;
}
