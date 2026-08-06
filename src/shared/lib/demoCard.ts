// The seeded (scripts/seed-pagalava.ts) public card every "try the demo"
// link across the marketing site and error pages should point at — Pagalava
// Data Analytics / Srinivasan Kandasamy's own card. Hoisted out of
// src/app/page.tsx so the 404 page (and anywhere else) can link to the same
// real card instead of drifting out of sync with a copy of these two IDs.
//
// These must be the seed script's actual UUIDs, not readable placeholder
// strings like "demo-company": companies.id/employees.id are uuid columns,
// so a lookup with a non-UUID string throws a Postgres type error rather
// than returning "not found," which the public card API (see its catch
// block) surfaces as a 503 "service unavailable" rather than a 404 — every
// "try the demo" link on the live site was silently broken until this was
// pointed at the real seeded row.
export const DEMO_COMPANY_ID = "33333333-3333-3333-3333-333333333333";
export const DEMO_EMPLOYEE_ID = "44444444-4444-4444-4444-444444444444";
export const DEMO_CARD_PATH = `/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`;
