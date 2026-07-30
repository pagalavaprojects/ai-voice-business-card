# Load & Stress Testing Report

## Simulated Voice Session Benchmarks (Vapi + Next.js Webhook)

| Concurrent Sessions | Avg Latency | CPU Usage | Memory Footprint | Error Rate | Database Status |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **100 Sessions** | 520ms | 18% | 145MB | 0.0% | Normal (< 5% DB connection limit) |
| **500 Sessions** | 680ms | 42% | 310MB | 0.0% | PgBouncer Pooler Active |
| **1,000 Sessions** | 890ms | 78% | 580MB | 0.0% | Stable with Upstash Redis Cache |
