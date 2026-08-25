/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Signing out.
 *
 * The app shipped without any way to end a session: once the cookie existed,
 * dropping it meant clearing site data. These pin the two things that make
 * the control trustworthy — it actually calls signOut, and it leaves the
 * dashboard even when that call fails, because by then the local session is
 * already gone and stranding someone on a page they can no longer load is
 * the worse outcome.
 */

const mockAuth = { signOut: jest.fn() };
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ auth: mockAuth }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

import { SignOutButton } from "@/features/auth/components/SignOutButton";

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signOut.mockResolvedValue({ error: null });
});

describe("sign out", () => {
  it("offers a control that names itself", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("clears the session and returns to the login page", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith("/login");
    // The client-side cache still holds pages rendered for the identity that
    // just left; refresh is what discards them.
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("still leaves the dashboard when the sign-out request fails", async () => {
    mockAuth.signOut.mockRejectedValue(new Error("network down"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });

  it("cannot be fired twice while it is working", async () => {
    let release: (value: { error: null }) => void = () => {};
    mockAuth.signOut.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<SignOutButton />);

    const button = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /signing out/i }));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);

    release({ error: null });
  });
});
