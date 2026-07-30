# Site Reliability Engineering (SRE) Runbook & SLO Manual

## 1. Service Level Indicators (SLIs) & Objectives (SLOs)
- **Voice Response Latency**: 95% of Vapi webhook responses delivered under **750ms** (SLO: 99.0%).
- **Database Query Latency**: 99% of GIN full-text search queries executed under **25ms** (SLO: 99.5%).
- **Platform Availability**: Webcard and Admin Dashboard API endpoints available **99.9%** (Monthly Error Budget: 43.8 minutes).

## 2. Recovery Targets
- **Recovery Point Objective (RPO)**: < 5 minutes (Supabase Point-In-Time Recovery).
- **Recovery Time Objective (RTO)**: < 15 minutes (Container failover).
