/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // e2e/*.spec.ts files use @playwright/test's own test runner and
  // globals (run via `npx playwright test`), not Jest — without this,
  // Jest's default testMatch also picks up *.spec.ts files and fails
  // trying to run them with the wrong test framework.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
};
