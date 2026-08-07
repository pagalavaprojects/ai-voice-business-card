export interface VCardContact {
  name: string;
  email: string;
  phone: string;
  company: string;
  designation: string;
  website?: string;
  /** Extra labeled links beyond the company website — an employee's own
   * social profiles, or a link back to this same AI voice card so importing
   * the contact doesn't strand the visitor without a way to return to it. */
  links?: Record<string, string>;
  /** Already-encoded `data:image/...;base64,...` — see imageUrlToDataUri.
   * Pre-resolved rather than a plain URL because generateVCard stays a pure,
   * synchronous function (fetching a remote image is inherently async); the
   * caller resolves these first. */
  photoDataUri?: string | null;
  /** vCard 3.0's LOGO property — the organization's mark, distinct from the
   * person's own PHOTO. Not every address book renders it (Apple/macOS
   * Contacts does; several Android clients ignore it), but it degrades to
   * simply not appearing rather than breaking the import. */
  logoDataUri?: string | null;
}

/** RFC 6350 §3.2 line folding: a physical line SHOULD NOT exceed 75 octets.
 * A folded line continues on the next line with a single leading space,
 * which parsers strip back out. Base64 PHOTO/LOGO payloads are, by far, the
 * only lines here long enough for this to matter — an unfolded 2KB base64
 * line has caused real address books to truncate or reject the whole card. */
function foldLine(line: string): string {
  const LIMIT = 75;
  if (line.length <= LIMIT) return line;
  const parts: string[] = [line.slice(0, LIMIT)];
  let rest = line.slice(LIMIT);
  while (rest.length > 0) {
    // One fewer column on continuation lines: the leading space itself
    // counts toward the 75-octet limit.
    parts.push(rest.slice(0, LIMIT - 1));
    rest = rest.slice(LIMIT - 1);
  }
  return parts.join("\r\n ");
}

/** Builds a PHOTO or LOGO property line from an already-encoded data URI, or
 * returns nothing if the URI is missing/malformed — a broken image must
 * never break the rest of the vCard. */
function imagePropertyLine(property: "PHOTO" | "LOGO", dataUri: string | null | undefined): string | null {
  if (!dataUri) return null;
  const match = /^data:image\/(\w+);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUri);
  if (!match) return null;
  const [, subtype, base64] = match;
  const type = subtype.toUpperCase() === "JPG" ? "JPEG" : subtype.toUpperCase();
  return foldLine(`${property};ENCODING=b;TYPE=${type}:${base64}`);
}

/**
 * Commas, semicolons and backslashes are structural separators in vCard and
 * must be escaped, or a company name like "Pagalava, Inc." silently splits
 * into two fields when imported into a phone's address book.
 */
function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Generates a vCard 3.0 (RFC 2426) card for the business card's "Save
 * contact" action — deliberately NOT vCard 4.0 (RFC 6350). 4.0 is newer and
 * marginally cleaner, but it has real gaps in exactly the clients this
 * needs to reach: classic desktop Outlook has no reliable 4.0 support at
 * all, and several stock/OEM Android contact apps still parse it
 * inconsistently or not at all. 3.0 is understood correctly by every
 * mainstream contact app in use today (Android, iOS/macOS Contacts,
 * Outlook, Google Contacts) with no compatibility caveats, which matters
 * more here than the incremental spec cleanliness — a saved contact that
 * silently fails to import on an older phone is a worse outcome than one
 * written to a slightly older, universally-supported spec version.
 */
export function generateVCard(contact: VCardContact): string {
  const parts = contact.name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escape(lastName)};${escape(firstName)};;;`,
    `FN:${escape(contact.name)}`,
    `ORG:${escape(contact.company)}`,
    `TITLE:${escape(contact.designation)}`,
    // CELL (not just WORK) so phones that group contact numbers by type —
    // most Android/iOS address books do — file this under "mobile" rather
    // than a generic work line; this number is a direct mobile line in
    // practice, not a shared office switchboard extension.
    `TEL;TYPE=CELL,WORK,VOICE:${escape(contact.phone)}`,
    `EMAIL;TYPE=WORK:${escape(contact.email)}`,
  ];
  if (contact.website) lines.push(`URL:${escape(contact.website)}`);

  const photoLine = imagePropertyLine("PHOTO", contact.photoDataUri);
  if (photoLine) lines.push(photoLine);
  const logoLine = imagePropertyLine("LOGO", contact.logoDataUri);
  if (logoLine) lines.push(logoLine);

  // vCard 3.0 has no plain "labeled URL" field — TYPE only accepts fixed
  // tokens like WORK/HOME, not free text. The `itemN.` grouping + X-ABLabel
  // pair is Apple's extension for a custom label, and it degrades safely:
  // iOS/macOS Contacts show the real label, everything else still imports it
  // as a plain extra website (untitled, not dropped).
  let itemIndex = 1;
  for (const [label, url] of Object.entries(contact.links ?? {})) {
    if (!url) continue;
    lines.push(`item${itemIndex}.URL:${escape(url)}`);
    lines.push(`item${itemIndex}.X-ABLabel:${escape(label)}`);
    itemIndex += 1;
  }

  lines.push("END:VCARD");

  // vCard requires CRLF line endings; some address books reject LF-only files.
  return lines.join("\r\n");
}

export function downloadVCard(contact: VCardContact): void {
  const blob = new Blob([generateVCard(contact)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${contact.name.replace(/\s+/g, "_")}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fetches a remote image and re-encodes it as a small base64 JPEG data URI,
 * suitable for embedding directly in a vCard.
 *
 * Embedding matters more than it might seem: several contact apps (notably
 * on Android) do not fetch a PHOTO given as a remote URI when importing a
 * .vcf — only inline base64 data reliably shows up. But the source image is
 * a full-resolution upload (the same file used on the card itself), and
 * base64 already adds ~33% overhead — embedding it as-is would bloat a
 * multi-megabyte photo into a vCard most phones balk at. Downscaling through
 * a canvas first keeps the embedded copy to a genuine thumbnail.
 *
 * Returns null on any failure (network, decode, canvas) — a missing photo
 * must degrade to no PHOTO property, never a broken "Save contact" button.
 */
export async function imageUrlToDataUri(url: string, maxDimension = 320, quality = 0.82): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();

    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}
