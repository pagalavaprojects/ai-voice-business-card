/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The authentication surface, tested for the properties that are easy to
 * regress by "improving" an error message.
 *
 * Two of them are security properties rather than UX ones:
 *
 *  - Sign-in and password recovery must not become account-enumeration
 *    oracles. Supabase distinguishes "invalid credentials" from "email not
 *    confirmed" and "user not found"; surfacing that distinction lets anyone
 *    with the login form test which addresses are registered.
 *  - Public sign-up must not be able to hand out platform admin. The client
 *    sends no role and no privilege flag, which is what makes the database
 *    default (is_platform_admin FALSE NOT NULL) the only possible outcome.
 */

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  updateUser: jest.fn(),
  getUser: jest.fn(),
  setSession: jest.fn(),
  onAuthStateChange: jest.fn((_cb: (event: string, session: unknown) => void) => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
};
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ auth: mockAuth }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: jest.fn() }),
}));

import LoginPage from "@/app/login/page";
import SignUpPage from "@/app/signup/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import { assessPassword, signUpErrorMessage, GENERIC_SIGN_IN_ERROR, GENERIC_SIGN_UP_ERROR, MIN_PASSWORD_LENGTH } from "@/features/auth/lib/passwordPolicy";

const STRONG = "Vault-Harbour-71!";

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** The marker /auth/callback sets when it exchanges a recovery link. */
const RECOVERY_COOKIE = "maylaan-recovery-flow";
const arriveThroughRecovery = () => {
  document.cookie = `${RECOVERY_COOKIE}=1; path=/`;
};
const clearRecoveryMarker = () => {
  document.cookie = `${RECOVERY_COOKIE}=; path=/; max-age=0`;
};

beforeEach(() => {
  jest.clearAllMocks();
  clearRecoveryMarker();
  mockAuth.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));
  window.history.replaceState({}, "", "/login");
});

describe("password policy", () => {
  it("accepts a long, mixed passphrase", () => {
    expect(assessPassword(STRONG).ok).toBe(true);
  });

  it("rejects anything shorter than the published minimum", () => {
    const verdict = assessPassword("Ab3!xY9$");
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("rejects long-but-trivial passwords", () => {
    expect(assessPassword("aaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(assessPassword("passwordpassword").ok).toBe(false);
  });

  it("rejects a password built from the account's own identity", () => {
    expect(assessPassword("Kandasamy-2026!", { name: "Kandasamy" }).ok).toBe(false);
    expect(assessPassword("Srinivasan-99$X", { email: "srinivasan@maylaanai.com" }).ok).toBe(false);
  });
});

describe("/login", () => {
  it("offers recovery and sign-up without leaving the page", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute("href", "/signup");
  });

  it("signs in and lands on the dashboard", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);

    typeInto(/work email/i, "user@maylaanai.com");
    typeInto(/^password$/i, STRONG);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: "user@maylaanai.com", password: STRONG });
  });

  it("gives one generic message for every credential failure", async () => {
    for (const providerMessage of ["Invalid login credentials", "Email not confirmed"]) {
      mockAuth.signInWithPassword.mockResolvedValue({ error: { message: providerMessage } });
      const { unmount } = render(<LoginPage />);

      typeInto(/work email/i, "someone@example.com");
      typeInto(/^password$/i, "whatever-they-typed");
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(GENERIC_SIGN_IN_ERROR);
      // The provider's wording is what distinguishes a registered address
      // from an unregistered one, so it must never be rendered.
      expect(alert).not.toHaveTextContent(providerMessage);
      unmount();
    }
  });

  it("does not keep the password in state after a failed attempt", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<LoginPage />);

    typeInto(/work email/i, "user@maylaanai.com");
    typeInto(/^password$/i, STRONG);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
  });

  it("finishes a fragment-form link and carries the visitor to its destination", async () => {
    // /auth/callback routes fragment sessions here because a protected page
    // cannot receive one — the middleware turns the request away before any
    // script can read the fragment.
    // jsdom will not let window.location be redefined; navigating with
    // replaceState sets the real search and hash.
    window.history.replaceState({}, "", "/login?next=/dashboard#access_token=abc&refresh_token=def&type=magiclink");
    mockAuth.setSession.mockResolvedValue({ error: null });

    render(<LoginPage />);

    // The client runs PKCE and ignores implicit fragments, so the tokens
    // must be handed to setSession explicitly.
    await waitFor(() => expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: "abc", refresh_token: "def" }));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    // The fragment must not be left in the address bar afterwards.
    expect(window.location.hash).toBe("");
  });

  it("says the link is spent when its fragment session is refused", async () => {
    window.history.replaceState({}, "", "/login?next=/dashboard#access_token=stale&refresh_token=stale");
    mockAuth.setSession.mockResolvedValue({ error: { message: "invalid claim: missing sub" } });

    render(<LoginPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired or was already used/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ignores a fragment that carries no session at all", async () => {
    window.history.replaceState({}, "", "/login#some=other-fragment");
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument());
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });

  it("explains a spent email link when the callback redirects here", async () => {
    window.history.replaceState({}, "", "/login?error=link_expired");
    render(<LoginPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired or was already used/i);
  });
});

describe("/signup", () => {
  function fillValidSignup() {
    typeInto(/full name/i, "Priya Raman");
    typeInto(/work email/i, "priya@example.com");
    typeInto(/^password$/i, STRONG);
    typeInto(/confirm password/i, STRONG);
  }

  it("sends only the name — never a role, company or privilege flag", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    render(<SignUpPage />);

    fillValidSignup();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(mockAuth.signUp).toHaveBeenCalled());
    const payload = mockAuth.signUp.mock.calls[0][0];
    expect(payload.options.data).toEqual({ full_name: "Priya Raman" });
    // Nothing anywhere in the request may name a privilege the server would
    // honour — no role, no company, no admin flag.
    expect(JSON.stringify(payload)).not.toMatch(/role|admin|is_platform|company_id/i);
  });

  it("offers no way to choose a role or claim admin", () => {
    render(<SignUpPage />);
    expect(screen.queryByLabelText(/role|admin|permission/i)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says the address must be confirmed when no session comes back", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    render(<SignUpPage />);

    fillValidSignup();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/confirmation link/i);
    // A brand-new account belongs to no workspace yet, and says so rather
    // than showing an empty dashboard that looks broken.
    expect(screen.getByText(/linked to a workspace yet/i)).toBeInTheDocument();
  });

  it("translates provider failures into something a visitor can act on", async () => {
    // Observed against production: Supabase answered a real sign-up with the
    // bare string "email rate limit exceeded", which describes the project's
    // mail quota rather than anything the visitor did.
    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "email rate limit exceeded" } });
    render(<SignUpPage />);

    fillValidSignup();
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too many sign-up attempts/i);
    expect(alert).not.toHaveTextContent(/rate limit exceeded/i);
  });

  it("says nothing about the project's configuration when it fails", () => {
    expect(signUpErrorMessage("Database error saving new user")).toBe(GENERIC_SIGN_UP_ERROR);
    expect(signUpErrorMessage("Error sending confirmation mail")).toBe(GENERIC_SIGN_UP_ERROR);
    expect(signUpErrorMessage("Password should be at least 6 characters")).toMatch(new RegExp(String(MIN_PASSWORD_LENGTH)));
    expect(signUpErrorMessage("Unable to validate email address: invalid format")).toMatch(/valid email/i);
  });

  it("will not submit a weak password or a mismatched confirmation", () => {
    render(<SignUpPage />);
    const submit = screen.getByRole("button", { name: /create account/i });

    typeInto(/full name/i, "Priya Raman");
    typeInto(/work email/i, "priya@example.com");
    typeInto(/^password$/i, "short1!A");
    typeInto(/confirm password/i, "short1!A");
    expect(submit).toBeDisabled();

    typeInto(/^password$/i, STRONG);
    typeInto(/confirm password/i, STRONG + "x");
    expect(submit).toBeDisabled();
    expect(screen.getByText(/both passwords must match/i)).toBeInTheDocument();

    typeInto(/confirm password/i, STRONG);
    expect(submit).toBeEnabled();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });
});

describe("/forgot-password", () => {
  async function submitRecovery(email: string) {
    render(<ForgotPasswordPage />);
    typeInto(/work email/i, email);
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    const status = await screen.findByRole("status");
    return status.textContent;
  }

  it("answers identically for a registered and an unregistered address", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const registered = await submitRecovery("user@maylaanai.com");

    document.body.innerHTML = "";
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const unregistered = await submitRecovery("nobody-at-all@example.com");

    expect(unregistered).toBe(registered);
    expect(registered).toMatch(/if that address has an account/i);
    expect(registered).not.toMatch(/not found/i);
  });

  it("points the emailed link at the callback, not straight at the form", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await submitRecovery("user@maylaanai.com");

    const [address, options] = mockAuth.resetPasswordForEmail.mock.calls[0];
    expect(address).toBe("user@maylaanai.com");
    // Without the exchange step the recovery code never becomes a session.
    expect(options.redirectTo).toContain("/auth/callback?next=/reset-password");
  });
});

describe("/reset-password", () => {
  it("renders no password field at all without a recovery session", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });
    render(<ResetPasswordPage />);

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("updates the password and moves on to the dashboard", async () => {
    arriveThroughRecovery();
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });
    mockAuth.updateUser.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);
    await screen.findByLabelText(/^new password$/i);

    typeInto(/^new password$/i, STRONG);
    typeInto(/confirm new password/i, STRONG);
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: STRONG }));
    expect(await screen.findByRole("status")).toHaveTextContent(/password updated/i);
  });

  it("recovers gracefully when the session expires mid-form", async () => {
    arriveThroughRecovery();
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });
    mockAuth.updateUser.mockResolvedValue({ error: { message: "Auth session missing!" } });
    render(<ResetPasswordPage />);
    await screen.findByLabelText(/^new password$/i);

    typeInto(/^new password$/i, STRONG);
    typeInto(/confirm new password/i, STRONG);
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
  });

  it("keeps the submit button out of reach until the password is strong and confirmed", async () => {
    arriveThroughRecovery();
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });
    render(<ResetPasswordPage />);

    const submit = await screen.findByRole("button", { name: /update password/i });
    expect(submit).toBeDisabled();

    typeInto(/^new password$/i, "tiny");
    typeInto(/confirm new password/i, "tiny");
    expect(submit).toBeDisabled();

    typeInto(/^new password$/i, STRONG);
    typeInto(/confirm new password/i, STRONG);
    expect(submit).toBeEnabled();
  });

  it("refuses to change the password of a session that did not come from a recovery link", async () => {
    // The defect this pins: the page used to ask only "is anyone signed in?".
    // A browser with an unrelated session already in it — the operator's own
    // account, say — would silently become the account whose password the
    // form changed. Reproduced in production once; never again.
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "someone-else", email: "ceo@example.com" } } });
    render(<ResetPasswordPage />);

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it("adopts a recovery session carried in the fragment", async () => {
    // The older link shape puts the session in the fragment, and the client
    // (PKCE) never notices it, so the page must set it explicitly.
    window.history.replaceState({}, "", "/reset-password#access_token=abc&refresh_token=def&type=recovery");
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });
    mockAuth.setSession.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } }, error: null });

    render(<ResetPasswordPage />);

    expect(await screen.findByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: "abc", refresh_token: "def" });
    expect(window.location.hash).toBe("");
  });

  it("will not let an ordinary fragment session unlock a password change", async () => {
    // Same shape, but the link was a magic link rather than a recovery one.
    window.history.replaceState({}, "", "/reset-password#access_token=abc&refresh_token=def&type=magiclink");
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });

    render(<ResetPasswordPage />);

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
    expect(mockAuth.setSession).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
  });

  it("refuses when the fragment session itself is rejected", async () => {
    window.history.replaceState({}, "", "/reset-password#access_token=stale&refresh_token=stale&type=recovery");
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });
    mockAuth.setSession.mockResolvedValue({ data: { user: null }, error: { message: "invalid claim" } });

    render(<ResetPasswordPage />);

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
  });

  it("accepts the fragment-token links, which authenticate in the browser", async () => {
    // Supabase's non-PKCE recovery mail lands with the session in the URL
    // fragment; the client announces it with this event instead of a cookie.
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });
    mockAuth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      setTimeout(() => cb("PASSWORD_RECOVERY", { user: { id: "u1", email: "user@maylaanai.com" } }), 0);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    render(<ResetPasswordPage />);

    expect(await screen.findByLabelText(/^new password$/i)).toBeInTheDocument();
  });

  it("names the account whose password is about to change", async () => {
    arriveThroughRecovery();
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });
    render(<ResetPasswordPage />);

    // Seeing the address is what makes a wrong-account reset obvious to the
    // person doing it.
    expect(await screen.findByText(/for user@maylaanai\.com/i)).toBeInTheDocument();
  });

  it("never puts a token in the page, the URL bar or the form", async () => {
    window.history.replaceState({}, "", "/reset-password");
    arriveThroughRecovery();
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "user@maylaanai.com" } } });
    const { container } = render(<ResetPasswordPage />);

    await screen.findByLabelText(/^new password$/i);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/access_token|refresh_token|[?&]code=/);
  });
});
