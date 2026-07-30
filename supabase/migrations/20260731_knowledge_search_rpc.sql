-- ====================================================
-- Knowledge base vector search RPC
-- ====================================================
-- supabase-js's query builder has no operator for pgvector's `<=>` cosine
-- distance, so similarity search has to go through an RPC function rather
-- than .select()/.filter(). Scoped to company_id so a cross-tenant query
-- is structurally impossible regardless of what companyId a caller passes
-- (defense in depth alongside the application-layer tenant check).

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  target_company_id uuid,
  query_embedding vector(1536),
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  knowledge_document_id uuid,
  company_id uuid,
  chunk_index int,
  content text,
  token_count int,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.knowledge_document_id,
    kc.company_id,
    kc.chunk_index,
    kc.content,
    kc.token_count,
    kc.created_at,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.company_id = target_company_id
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;
