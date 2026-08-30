/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

/**
 * Regression test for the production multilingual bug: the deployed bundle
 * once carried a standalone `useEffect(() => { if (card.language !==
 * language) setLanguage(card.language) }, [card, language])` that compared a
 * STALE `card` object against LIVE `language` state, snapping the UI back to
 * a previous selection the instant a new fetch was in flight (card hadn't
 * updated yet, but language already had).
 *
 * The fix (see PublicBusinessCard.tsx's fetch effect) scopes the
 * "did the server clamp this?" comparison to `requestedLanguage`, captured
 * once per fetch, and relies on React's effect-cleanup ordering — changing
 * companyId/employeeId/language cleans up the in-flight previous fetch's own
 * closure (cancelled = true, controller aborted) before the new fetch's
 * effect runs — so a late-arriving response for an identity the visitor has
 * already moved on from can never overwrite current state.
 *
 * The card renders a loading skeleton (hiding the language selector) for the
 * duration of any refetch, which rules out reproducing this via two rapid
 * selector clicks — the control that would need to survive them is exactly
 * what's hidden. The realistic equivalent the component's own comments
 * document as supported is the same effect firing again because
 * companyId/employeeId changed (client-side navigation to a different card
 * without a full remount) — this test uses that path to force two fetches to
 * overlap, then resolves the older one last.
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

// A minimal fetch Response stand-in — jsdom in this Jest environment has no
// global Response constructor, and the component only ever calls .ok/.json().
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

interface Deferred {
  promise: Promise<FakeResponse>;
  resolve: (value: FakeResponse) => void;
}

function deferred(): Deferred {
  let resolve!: (value: FakeResponse) => void;
  const promise = new Promise<FakeResponse>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function cardResponseFor(lang: string, employeeName: string): FakeResponse {
  const body = {
    company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
    employee: { name: employeeName, designation: "Founder", email: "s@pagalava.com", phone: "+911234567890", officeAddress: null, workingHours: null, avatarUrl: null },
    firstMessage: "Hello!",
    language: lang,
    enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
  };
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe("PublicBusinessCard — multilingual fetch race condition", () => {
  const pending = new Map<string, Deferred>();

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "ta");
    pending.clear();
    global.fetch = jest.fn((url: string) => {
      const parsed = new URL(url, "https://maylaanai.com");
      const key = `${parsed.pathname}?lang=${parsed.searchParams.get("lang") ?? "ta"}`;
      const d = deferred();
      pending.set(key, d);
      return d.promise;
    }) as unknown as typeof fetch;
  });

  it("a per-card language clamp is displayed but does NOT overwrite the visitor's stored cross-card preference", async () => {
    // Stored preference is Tamil (beforeEach). This company has Tamil
    // disabled, so the server clamps ta -> en. The card must SHOW English,
    // but the visitor's durable Tamil preference must survive untouched — the
    // clamp is a per-card display decision, not a choice they made.
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-1?lang=ta")).toBe(true));
    await act(async () => {
      // Requested ta, server returns en (clamped to this company's enabled set).
      pending.get("/api/public/comp-1/emp-1?lang=ta")!.resolve(cardResponseFor("en", "Srinivasan Kandasamy"));
    });

    // The card now DISPLAYS English (the clamped, available language)...
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("en"));
    // ...but the visitor's durable cross-card preference was NOT overwritten.
    expect(window.localStorage.getItem("pagalava.language")).toBe("ta");
  });

  it("a single language switch does not get silently reverted while its fetch is still in flight", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-1?lang=ta")).toBe(true));
    await act(async () => {
      pending.get("/api/public/comp-1/emp-1?lang=ta")!.resolve(cardResponseFor("ta", "Srinivasan Kandasamy"));
    });

    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("ta");

    await act(async () => {
      fireEvent.change(select, { target: { value: "hi" } });
    });

    // The new fetch is now in flight and deliberately left unresolved — the
    // card falls back to its loading skeleton for this window (by design,
    // not the bug under test), but the underlying `language` state itself
    // must already be "hi", not reverted back to "ta" by anything else.
    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-1?lang=hi")).toBe(true));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); // skeleton, as designed

    await act(async () => {
      pending.get("/api/public/comp-1/emp-1?lang=hi")!.resolve(cardResponseFor("hi", "Srinivasan Kandasamy"));
    });

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("hi"));
  });

  it("never lets a stale, late-resolving fetch for a card identity the visitor navigated away from overwrite current state", async () => {
    const { rerender } = render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-1?lang=ta")).toBe(true));
    await act(async () => {
      pending.get("/api/public/comp-1/emp-1?lang=ta")!.resolve(cardResponseFor("ta", "Employee One"));
    });
    await screen.findByText("Employee One");

    // Visitor switches language — this fetch is held open, standing in for a
    // slow network response.
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "hi" } });
    });
    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-1?lang=hi")).toBe(true));

    // Before that resolves, the visitor navigates client-side to a different
    // team member's card (documented as a supported case in the component's
    // own comments) — this is the request that should actually win.
    rerender(<PublicBusinessCard companyId="comp-1" employeeId="emp-2" />);
    await waitFor(() => expect(pending.has("/api/public/comp-1/emp-2?lang=hi")).toBe(true));
    await act(async () => {
      pending.get("/api/public/comp-1/emp-2?lang=hi")!.resolve(cardResponseFor("hi", "Employee Two"));
    });
    await screen.findByText("Employee Two");

    // Now the stale emp-1 request FINALLY resolves — late, for an identity
    // the visitor already navigated away from. It must be ignored: React ran
    // that effect's cleanup (cancelled = true, controller aborted) the
    // moment employeeId changed, before this promise ever settles.
    await act(async () => {
      pending.get("/api/public/comp-1/emp-1?lang=hi")!.resolve(cardResponseFor("hi", "Stale Employee One Response"));
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Stale Employee One Response")).not.toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });
});
