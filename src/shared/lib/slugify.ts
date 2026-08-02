/**
 * Produces a slug the SlugSchema in types.ts will accept — the two must agree,
 * or the UI's auto-generated slug gets rejected by its own API.
 *
 * Diacritics are stripped via NFKD decomposition so "Café Découverte" becomes
 * "cafe-decouverte" rather than dropping the letters entirely.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
}
