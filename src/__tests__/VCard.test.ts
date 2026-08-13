import { generateVCard } from "@/features/voice/lib/vcard";

const CONTACT = {
  name: "Srinivasan Kandasamy",
  email: "srinivasan@pagalava.com",
  phone: "+91 93446 25639",
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

  describe("embedded photo and logo", () => {
    // 100 base64 chars is well past the 75-octet fold limit, so this alone
    // exercises the folding path without needing a real image fixture.
    const SHORT_PHOTO = "data:image/jpeg;base64," + "A".repeat(100);

    it("emits a PHOTO property with the encoding and type from the data URI", () => {
      const card = generateVCard({ ...CONTACT, photoDataUri: SHORT_PHOTO });
      expect(card).toContain("PHOTO;ENCODING=b;TYPE=JPEG:");
    });

    it("emits LOGO as a distinct property from PHOTO, so an address book that reads both shows the right image for each", () => {
      const card = generateVCard({ ...CONTACT, photoDataUri: SHORT_PHOTO, logoDataUri: SHORT_PHOTO });
      expect(card).toContain("PHOTO;ENCODING=b;TYPE=JPEG:");
      expect(card).toContain("LOGO;ENCODING=b;TYPE=JPEG:");
    });

    it("folds a long base64 line at 75 octets per RFC 6350, continuation lines starting with a single space", () => {
      const card = generateVCard({ ...CONTACT, photoDataUri: SHORT_PHOTO });
      const allLines = card.split("\r\n");
      const startIndex = allLines.findIndex((l) => l.startsWith("PHOTO;ENCODING=b;TYPE=JPEG:"));
      expect(startIndex).toBeGreaterThanOrEqual(0);

      // Walk forward while lines are continuations (start with a space) —
      // that run is the folded PHOTO property, nothing more.
      const propertyLines = [allLines[startIndex]];
      let i = startIndex + 1;
      while (i < allLines.length && allLines[i].startsWith(" ")) {
        propertyLines.push(allLines[i]);
        i += 1;
      }

      expect(propertyLines.length).toBeGreaterThan(1); // actually folded, not one long line
      for (const line of propertyLines.slice(1)) {
        expect(line.startsWith(" ")).toBe(true);
      }
      for (const line of propertyLines) {
        expect(line.length).toBeLessThanOrEqual(75);
      }
      // Rejoining and stripping the fold markers reproduces the original,
      // unfolded content exactly — folding must be lossless.
      const rejoined = propertyLines[0] + propertyLines.slice(1).map((l) => l.slice(1)).join("");
      expect(rejoined).toBe(`PHOTO;ENCODING=b;TYPE=JPEG:${SHORT_PHOTO.split(",")[1]}`);
    });

    it("omits PHOTO and LOGO entirely when no image is available, rather than emitting an empty property", () => {
      const card = generateVCard(CONTACT);
      expect(card).not.toContain("PHOTO");
      expect(card).not.toContain("LOGO");
    });

    it("normalizes a jpg subtype to the vCard-standard JPEG token", () => {
      const card = generateVCard({ ...CONTACT, photoDataUri: "data:image/jpg;base64,AAAA" });
      expect(card).toContain("TYPE=JPEG:");
    });

    it("ignores a malformed data URI rather than emitting a broken property", () => {
      const card = generateVCard({ ...CONTACT, photoDataUri: "not-a-data-uri" });
      expect(card).not.toContain("PHOTO");
    });
  });
});
