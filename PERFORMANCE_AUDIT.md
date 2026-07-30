# Performance & Latency Audit Report

## Benchmarks & Latency Targets:
- **Webhook Response Time**: ~45ms - 120ms (Assembles prompt context & tool array).
- **PostgreSQL Full-Text Search**: ~5ms - 15ms (GIN indexed text vector lookup on products and FAQs).
- **Voice Response Time (End-to-End)**: ~550ms - 850ms (Vapi WebRTC streaming + GPT-4o-mini).

## Recommended Optimizations:
- Wrap `SupabaseKnowledgeRepository` with a Redis memory cache to avoid DB roundtrips during voice spikes.
- Use Next.js `next/dynamic` for heavy visualizer components to minimize initial JS bundle size.
