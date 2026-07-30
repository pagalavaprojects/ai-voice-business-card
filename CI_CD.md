# CI/CD Pipeline & GitHub Actions Specification

The automated GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every pull request and main branch push to execute:
1. `npx tsc --noEmit` (TypeScript Verification)
2. `npx jest --ci` (Automated Unit & Integration Test Suite)
3. `npm run build` (Production Next.js SWC Build Verification)
