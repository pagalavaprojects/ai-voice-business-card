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
};
const mockPush = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ auth: mockAuth }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

import LoginPage from "@/app/login/page";
import SignUpPage from "@/app/signup/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import { assessPassword, GENERIC_SIGN_IN_ERROR, MIN_PASSWORD_LENGTH } from "@/features/auth/lib/passwordPolicy";

const STRONG = "Vault-Harbour-71!";

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  jest.clearAllMocks();
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
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
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
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAuth.updateUser.mockResolvedValue({ error: { message: "Auth session missing!" } });
    render(<ResetPasswordPage />);
    await screen.findByLabelText(/^new password$/i);

    typeInto(/^new password$/i, STRONG);
    typeInto(/confirm new password/i, STRONG);
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/this link can/i)).toBeInTheDocument();
  });

  it("keeps the submit button out of reach until the password is strong and confirmed", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
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

  it("never puts a token in the page, the URL bar or the form", async () => {
    window.history.replaceState({}, "", "/reset-password");
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { container } = render(<ResetPasswordPage />);

    await screen.findByLabelText(/^new password$/i);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/access_token|refresh_token|[?&]code=/);
  });
});
