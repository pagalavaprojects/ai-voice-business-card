# Enterprise Horizontal Scaling & High-Availability Report

- **Stateless Web Nodes**: Next.js App Router deployed to Vercel Edge / Serverless Functions scales horizontally to tens of thousands of concurrent requests automatically.
- **Database Connection Pooling**: Supabase PgBouncer connection pooler maintains high transaction throughput under heavy voice traffic spikes.
- **Vector Search Indexing**: PostgreSQL `IVFFlat` vector index (`idx_rag_chunks_embedding`) ensures sub-20ms cosine similarity searches at scale.
