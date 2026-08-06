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

  describe("extra labeled links", () => {
    it("emits each as an itemN.URL + itemN.X-ABLabel pair, preserving the label", () => {
      const card = generateVCard({ ...CONTACT, links: { "click my AI-Voice Card": "https://ai-voice-business-card.vercel.app/a/b" } });
      expect(card).toContain("item1.URL:https://ai-voice-business-card.vercel.app/a/b");
      expect(card).toContain("item1.X-ABLabel:click my AI-Voice Card");
    });

    it("numbers multiple links sequentially without colliding", () => {
      const card = generateVCard({
        ...CONTACT,
        links: { LinkedIn: "https://linkedin.com/in/srini", "AI Voice Card": "https://example.com/card" },
      });
      expect(card).toContain("item1.URL:https://linkedin.com/in/srini");
      expect(card).toContain("item1.X-ABLabel:LinkedIn");
      expect(card).toContain("item2.URL:https://example.com/card");
      expect(card).toContain("item2.X-ABLabel:AI Voice Card");
    });

    it("skips an empty URL rather than emitting an unusable item", () => {
      const card = generateVCard({ ...CONTACT, links: { Empty: "" } });
      expect(card).not.toContain("X-ABLabel:Empty");
    });

    it("escapes the label the same way every other field is escaped", () => {
      const card = generateVCard({ ...CONTACT, links: { "Ping, Pong; Co": "https://example.com" } });
      expect(card).toContain("item1.X-ABLabel:Ping\\, Pong\\; Co");
    });

    it("leaves the primary URL line untouched when there are no extra links", () => {
      const card = generateVCard(CONTACT);
      expect(card).not.toContain("item1.");
    });
  });
});
