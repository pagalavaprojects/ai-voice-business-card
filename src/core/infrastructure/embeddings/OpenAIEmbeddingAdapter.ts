import { isPlaceholderCredential } from "@/shared/lib/security";

export class EmbeddingUnavailableError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured — embeddings require live infrastructure");
    this.name = "EmbeddingUnavailableError";
  }
}

/**
 * Real OpenAI embeddings call (text-embedding-3-small, 1536 dims to match
 * knowledge_chunks.embedding). Unlike ResendEmailAdapter/CalcomAdapter,
 * there is no honest "demo" fallback for a vector embedding — a fake
 * vector would silently corrupt similarity search instead of just logging
 * a simulated action, so this throws a typed, catchable error instead of
 * fabricating output when the key is missing/placeholder.
 */
export class OpenAIEmbeddingAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
  }

  isConfigured(): boolean {
    return !isPlaceholderCredential(this.apiKey);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) throw new EmbeddingUnavailableError();
    if (texts.length === 0) return [];

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAIEmbeddingAdapter.embed failed: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    return (json.data as Array<{ embedding: number[]; index: number }>)
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
