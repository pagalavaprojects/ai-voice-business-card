/** The card created by `npm run seed:pagalava`.
 *
 * These specs need a real card to exist, because the public page no longer
 * invents a fallback identity when the lookup fails — an unknown id now
 * correctly renders a not-found state instead of a stranger's name.
 *
 * Kept in a plain module rather than a spec file: Playwright rejects
 * spec-to-spec imports ("test file should not import test file").
 */
export const SEEDED_CARD_PATH = "/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444";
