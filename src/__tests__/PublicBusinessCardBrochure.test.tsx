/**
 * @jest-environment jsdom
 *
 * The brochure action reuses the existing extensible "social_links" JSONB
 * mechanism (the same one "click my AI-Voice Card" already goes through) —
 * no schema change, no new API route. It gets its own document icon and
 * label rather than falling into the generic chain-link "other links" loop,
 * the same special-casing LinkedIn already receives, so it must render
 * exactly once, not twice.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

jest.mock("@/features/voice/hooks/useVapiSession", () => ({
  useVapiSession: () => ({
    voiceState: "idle",
    isMuted: false,
    messages: [],
    durationSeconds: 0,
    error: null,
    isPlayingIntro: false,
    isDemoMode: true,
    callId: null,
    startCall: jest.fn(),
    endCall: jest.fn(),
    toggleMute: jest.fn(),
  }),
}));

const BROCHURE_URL = "https://atiylleojxtjeruppyhq.supabase.co/storage/v1/object/public/brochures/comp-1/emp-1/brochure.jpeg";

function cardResponse(socialLinks: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
        employee: {
          name: "Srinivasan Kandasamy",
          designation: "Founder",
          email: "s@pagalava.com",
          phone: "+911234567890",
          officeAddress: null,
          workingHours: null,
          avatarUrl: null,
        },
        firstMessage: "Hello.",
        systemPrompt: "BASE_SYSTEM_PROMPT_MARKER",
        language: "en",
        enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
        tools: [],
        serverUrl: "https://maylaanai.com/api/vapi/webhook",
        socialLinks,
      }),
  };
}

describe("PublicBusinessCard — Brochure action", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
  });

  it("renders a Brochure link pointing at the stored social_links URL when present", async () => {
    global.fetch = jest.fn(() => Promise.resolve(cardResponse({ Brochure: BROCHURE_URL }))) as unknown as typeof fetch;
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    const link = await screen.findByRole("link", { name: /brochure/i });
    expect(link).toHaveAttribute("href", BROCHURE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no Brochure link when social_links has no brochure entry — never a broken/fake link", async () => {
    global.fetch = jest.fn(() => Promise.resolve(cardResponse({}))) as unknown as typeof fetch;
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    await screen.findByTestId("voice-mic-button");
    expect(screen.queryByRole("link", { name: /brochure/i })).toBeNull();
  });

  it("does not duplicate the Brochure entry in the generic other-links list — exactly one link, not two", async () => {
    global.fetch = jest.fn(() => Promise.resolve(cardResponse({ Brochure: BROCHURE_URL }))) as unknown as typeof fetch;
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    await screen.findByRole("link", { name: /brochure/i });
    expect(screen.getAllByRole("link", { name: /brochure/i })).toHaveLength(1);
  });

  it("is lookup-case-insensitive on the social_links key, matching the existing LinkedIn pattern", async () => {
    global.fetch = jest.fn(() => Promise.resolve(cardResponse({ brochure: BROCHURE_URL }))) as unknown as typeof fetch;
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    const link = await screen.findByRole("link", { name: /brochure/i });
    expect(link).toHaveAttribute("href", BROCHURE_URL);
  });
});
