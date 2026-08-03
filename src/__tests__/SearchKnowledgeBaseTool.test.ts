import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { OpenAIEmbeddingAdapter } from "@/core/infrastructure/embeddings/OpenAIEmbeddingAdapter";
import { IKnowledgeDocumentRepository } from "@/core/domain/repositories/IKnowledgeDocumentRepository";

/**
 * Regression coverage for search_knowledge_base.
 *
 * The RAG document pipeline (Knowledge Base page: upload a PDF/DOCX/TXT, it
 * gets chunked and embedded, status flips to READY) has existed with a full
 * admin UI and an admin-only search endpoint, but nothing on the live call
 * path could ever reach it — no tool existed for the assistant to query it.
 * An admin could upload and index a document and it would still never inform
 * a single answer a caller received. This wires it in.
 */
const CTX = { companyId: "company-1", employeeId: "employee-1" };

function makeRegistry(opts: { docRepo?: Partial<IKnowledgeDocumentRepository>; embeddingAdapter?: OpenAIEmbeddingAdapter } = {}) {
  const crmRepo = {} as never;
  const bookingRepo = {} as never;
  const knowledgeRepo = {} as never;
  return new ToolRegistry(
    crmRepo,
    bookingRepo,
    knowledgeRepo,
    undefined,
    undefined,
    undefined,
    undefined,
    opts.docRepo as IKnowledgeDocumentRepository | undefined,
    opts.embeddingAdapter
  );
}

describe("search_knowledge_base", () => {
  it("is advertised in the tool definitions sent to Vapi", () => {
    const registry = makeRegistry();
    const names = registry.getAllToolDefinitions().map((d) => d.function.name);
    expect(names).toContain("search_knowledge_base");
  });

  it("uses vector search when embeddings are configured", async () => {
    const searchByVector = jest.fn().mockResolvedValue([{ content: "Refunds are processed within 5 business days." }]);
    const embed = jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const embeddingAdapter = { isConfigured: () => true, embed } as unknown as OpenAIEmbeddingAdapter;

    const registry = makeRegistry({ docRepo: { searchByVector }, embeddingAdapter });
    const result = await registry.getTool("search_knowledge_base")!.execute({ query: "refund policy" }, CTX);

    expect(embed).toHaveBeenCalledWith(["refund policy"]);
    expect(searchByVector).toHaveBeenCalledWith("company-1", [0.1, 0.2, 0.3]);
    expect(result.success).toBe(true);
    expect(result.results).toEqual([{ content: "Refunds are processed within 5 business days." }]);
  });

  it("falls back to text search when no embedding key is configured", async () => {
    const searchByText = jest.fn().mockResolvedValue([{ content: "Office hours are 9 to 6." }]);
    const embeddingAdapter = { isConfigured: () => false, embed: jest.fn() } as unknown as OpenAIEmbeddingAdapter;

    const registry = makeRegistry({ docRepo: { searchByText }, embeddingAdapter });
    const result = await registry.getTool("search_knowledge_base")!.execute({ query: "office hours" }, CTX);

    expect(searchByText).toHaveBeenCalledWith("company-1", "office hours");
    expect(result.success).toBe(true);
  });

  it("degrades honestly rather than crashing when no knowledge base is wired up", async () => {
    const registry = makeRegistry();
    const result = await registry.getTool("search_knowledge_base")!.execute({ query: "anything" }, CTX);

    expect(result.success).toBe(false);
    expect(String(result.message)).toMatch(/no knowledge base/i);
  });

  it("degrades honestly instead of throwing when the document store errors mid-call", async () => {
    const searchByText = jest.fn().mockRejectedValue(new Error("db unreachable"));
    const embeddingAdapter = { isConfigured: () => false, embed: jest.fn() } as unknown as OpenAIEmbeddingAdapter;

    const registry = makeRegistry({ docRepo: { searchByText }, embeddingAdapter });
    const result = await registry.getTool("search_knowledge_base")!.execute({ query: "anything" }, CTX);

    expect(result.success).toBe(false);
    expect(String(result.message)).toMatch(/could not search/i);
  });
});
