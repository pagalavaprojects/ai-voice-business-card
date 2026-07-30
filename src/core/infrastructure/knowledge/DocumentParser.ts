import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { KnowledgeSourceType } from "@/core/domain/models/types";

/** Extracts plain text from an uploaded file. PDF/DOCX parsing is real
 * (pdf-parse / mammoth), not stubbed — this is CPU-bound and needs no
 * external API, unlike embedding generation below. */
export async function parseDocumentText(buffer: Buffer, sourceType: KnowledgeSourceType): Promise<string> {
  switch (sourceType) {
    case "PDF": {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    case "DOCX": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "TXT":
    case "MARKDOWN":
      return buffer.toString("utf-8");
    default: {
      const exhaustive: never = sourceType;
      throw new Error(`Unsupported source type: ${exhaustive}`);
    }
  }
}

export function inferSourceType(filename: string, mimeType: string): KnowledgeSourceType | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf" || mimeType === "application/pdf") return "PDF";
  if (ext === "docx" || mimeType.includes("wordprocessingml")) return "DOCX";
  if (ext === "md" || ext === "markdown") return "MARKDOWN";
  if (ext === "txt" || mimeType === "text/plain") return "TXT";
  return null;
}
