// The seeded (scripts/seed-pagalava.ts) public card every "try the demo"
// link across the marketing site and error pages should point at. Hoisted
// out of src/app/page.tsx so the 404 page (and anywhere else) can link to
// the same real card instead of drifting out of sync with a copy of these
// two literals.
export const DEMO_COMPANY_ID = "demo-company";
export const DEMO_EMPLOYEE_ID = "demo-employee";
export const DEMO_CARD_PATH = `/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`;
