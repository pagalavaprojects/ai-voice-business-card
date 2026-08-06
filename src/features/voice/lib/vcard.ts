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
}

/**
 * RFC 6350 vCard, used by the business card's "Save contact" action.
 *
 * Commas, semicolons and backslashes are structural separators in vCard and
 * must be escaped, or a company name like "Pagalava, Inc." silently splits
 * into two fields when imported into a phone's address book.
 */
function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

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
    `TEL;TYPE=WORK,VOICE:${escape(contact.phone)}`,
    `EMAIL;TYPE=WORK:${escape(contact.email)}`,
  ];
  if (contact.website) lines.push(`URL:${escape(contact.website)}`);

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
