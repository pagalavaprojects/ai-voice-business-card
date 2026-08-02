import { generateVCard } from "@/features/voice/lib/vcard";

const CONTACT = {
  name: "Srinivasan Kandasamy",
  email: "srinivasan@pagalava.com",
  phone: "+1 (555) 010-4477",
  company: "Pagalava Data Analytics",
  designation: "Founder",
  website: "https://pagalava.com",
};

describe("vCard generation", () => {
  it("produces a well-formed vCard with CRLF line endings", () => {
    const card = generateVCard(CONTACT);
    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0")).toBe(true);
    expect(card.endsWith("END:VCARD")).toBe(true);
    // Some address books reject LF-only files outright.
    expect(card.includes("\r\n")).toBe(true);
  });

  it("splits the name into structured N and FN fields", () => {
    const card = generateVCard(CONTACT);
    expect(card).toContain("N:Kandasamy;Srinivasan;;;");
    expect(card).toContain("FN:Srinivasan Kandasamy");
  });

  it("escapes separators so a comma doesn't split one field into two", () => {
    // The real failure this guards: "Pagalava, Inc." imports as an organisation
    // named "Pagalava" plus a stray unit "Inc." because the comma is a vCard
    // structural separator.
    const card = generateVCard({ ...CONTACT, company: "Pagalava, Inc.; Data" });
    expect(card).toContain("ORG:Pagalava\\, Inc.\\; Data");
  });

  it("handles a single-word name without emitting undefined", () => {
    const card = generateVCard({ ...CONTACT, name: "Cher" });
    expect(card).toContain("N:;Cher;;;");
    expect(card).not.toContain("undefined");
  });

  it("omits URL when no website is set rather than writing an empty field", () => {
    const { website: _unused, ...noSite } = CONTACT;
    expect(generateVCard(noSite)).not.toContain("URL:");
  });
});
