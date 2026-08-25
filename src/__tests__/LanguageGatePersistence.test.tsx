/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

/**
 * Regression test for a gate that asked the same visitor the same question
 * forever.
 *
 * The card confirmed the language gate with `if (code !== language)
 * setLanguage(code)`. `language` at that moment is the AUTO-DETECTED guess,
 * so anyone who agreed with the guess — an English browser choosing English,
 * a Tamil browser choosing Tamil — stored nothing at all, and the gate
 * reappeared on their next visit. Only visitors who disagreed with the
 * detection ever got a saved preference.
 *
 * Confirming a language is the preference. Both cases are pinned below.
 */

jest.mock("@/features/voice/hooks/useVapiSession", () => ({
  useVapiSession: () => ({
    voiceState: "idle",
    isMuted: false,
    messages: [],
    durationSeconds: 0,
    error: null,
    isPlayingIntro: false,
    isDemoMode: true,
    startCall: jest.fn(),
    endCall: jest.fn(),
    toggleMute: jest.fn(),
  }),
}));

function cardBody(lang: string) {
  return {
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
    firstMessage: "Hello!",
    language: lang,
    enabledLanguages: ["ta", "en", "hi", "te", "ml", "kn"],
  };
}

describe("the language gate records what the visitor confirmed", () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn((url: string) => {
      const lang = new URL(url, "https://maylaanai.com").searchParams.get("lang") ?? "ta";
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cardBody(lang)) });
    }) as unknown as typeof fetch;
  });

  async function confirmLanguage(pattern: RegExp) {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const card = await screen.findByRole("radio", { name: pattern });
    await act(async () => {
      fireEvent.click(card);
    });
    const continueButton = screen.getAllByRole("button").find((b) => !b.hasAttribute("disabled") && b.textContent);
    await act(async () => {
      fireEvent.click(continueButton as HTMLElement);
    });
  }

  it("stores the choice when it AGREES with the detected language", async () => {
    // navigator.language is "en-US" in jsdom, so English is the guess — the
    // exact case that used to store nothing.
    await confirmLanguage(/English/);

    await waitFor(() => expect(window.localStorage.getItem("pagalava.language")).toBe("en"));
    expect(document.cookie).toContain("pagalava.language=en");
  });

  it("stores the choice when it DIFFERS from the detected language", async () => {
    await confirmLanguage(/தமிழ்/);

    await waitFor(() => expect(window.localStorage.getItem("pagalava.language")).toBe("ta"));
    expect(document.cookie).toContain("pagalava.language=ta");
  });

  it("a stored preference skips the gate entirely on the next visit", async () => {
    window.localStorage.setItem("pagalava.language", "ta");
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    // The card itself, not the question — the visitor already answered it.
    expect(await screen.findByRole("combobox")).toHaveValue("ta");
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
