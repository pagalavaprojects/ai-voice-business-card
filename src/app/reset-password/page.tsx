"use client";

import React, { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/shared/ui/button";
import { AuthShell, AuthError, AuthNotice, AuthLink, authInputClass } from "@/features/auth/components/AuthShell";
import { assessPassword, MIN_PASSWORD_LENGTH } from "@/features/auth/lib/passwordPolicy";
import { RECOVERY_FLOW_COOKIE } from "@/features/auth/lib/recoveryFlow";

type SessionState = "checking" | "ready" | "missing";

/**
 * Choose a new password.
 *
 * Reached only through the emailed link, which /auth/callback has already
 * exchanged for a recovery session — so the proof of identity is the session
 * cookie, and this page never handles, stores or displays a token itself.
 * With no such session the form is not rendered at all: an expired, reused
 * or forged link gets an explanation and a way to request another, not a
 * password field that would fail on submit.
 *
 * A session alone is NOT enough, and that distinction is the whole point of
 * the extra check below. "Is anyone signed in?" is the wrong question: any
 * unrelated session already in the browser would silently become the account
 * whose password this page changes — which is exactly what happened when
 * this page shipped with only the session test. The page therefore also
 * requires evidence that the visitor arrived through recovery (the marker
 * /auth/callback sets for the PKCE links, or Supabase's PASSWORD_RECOVERY
 * event for the token-in-fragment links), and it names the account it is
 * about to change so the person can see it too.
 *
 * The new password lives in component state only until the request returns,
 * and is never sent anywhere except Supabase's own updateUser.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );

  useEffect(() => {
    let cancelled = false;

    // The fragment-token links (Supabase generates these for admin-issued and
    // non-PKCE recovery mail) authenticate in the browser, and this event is
    // how the client says so.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || event !== "PASSWORD_RECOVERY") return;
      setAccountEmail(session?.user?.email ?? null);
      setSessionState("ready");
    });

    const arrivedThroughRecovery = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${RECOVERY_FLOW_COOKIE}=`));

    // A recovery link of the older shape arrives with its session in the
    // fragment, and the PASSWORD_RECOVERY event above never fires for it:
    // this client runs the PKCE flow and its URL detection ignores implicit
    // fragments entirely. So the tokens are handed to setSession here, and
    // only when the fragment says `type=recovery` — a fragment carrying an
    // ordinary session must not unlock a password change.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    if (fragment.get("type") === "recovery" && accessToken && refreshToken) {
      void supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error: sessionError }) => {
          if (cancelled) return;
          // Do not leave the tokens sitting in the address bar or history.
          window.history.replaceState({}, "", "/reset-password");
          if (sessionError || !data.user) {
            setSessionState("missing");
            return;
          }
          setAccountEmail(data.user.email ?? null);
          setSessionState("ready");
        })
        .catch(() => {
          if (!cancelled) setSessionState("missing");
        });
      return () => {
        cancelled = true;
        authListener.subscription.unsubscribe();
      };
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.user && arrivedThroughRecovery) {
          setAccountEmail(data.user.email ?? null);
          setSessionState("ready");
          return;
        }
        // Either nobody is signed in, or somebody is but did not get here
        // through a recovery link. Both must be refused: the second is a
        // session that was never nominated for a password change.
        setSessionState((current) => (current === "ready" ? current : "missing"));
      })
      .catch(() => {
        if (!cancelled) setSessionState((current) => (current === "ready" ? current : "missing"));
      });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
    // The client is recreated per render but is stateless here; the check is
    // intentionally once-per-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verdict = assessPassword(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!verdict.ok) {
      setError(verdict.problems[0]);
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // Most often the recovery session expired between opening the link
        // and submitting. Say so plainly — it is actionable and reveals
        // nothing about the account.
        setError("That reset link is no longer valid. Request a new one and try again.");
        setSessionState("missing");
        return;
      }
      // Clear the entered value as soon as it is no longer needed, and spend
      // the recovery marker so the page cannot be reused on a later visit.
      setPassword("");
      setConfirm("");
      document.cookie = `${RECOVERY_FLOW_COOKIE}=; path=/; max-age=0; SameSite=Lax; Secure`;
      setDone(true);
      // The session is already authenticated, so land them where they belong.
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionState === "checking") {
    return (
      <AuthShell title="Checking your link…">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          One moment.
        </div>
      </AuthShell>
    );
  }

  if (sessionState === "missing") {
    return (
      <AuthShell
        title="This link can't be used"
        subtitle="Reset links work once and expire quickly."
        footer={<AuthLink href="/forgot-password">Request a new link</AuthLink>}
      >
        <AuthError message="Open the most recent link from your email, or request a new one." />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={accountEmail ? `For ${accountEmail}` : undefined}
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      {error && <AuthError message={error} />}
      {done && <AuthNotice message="Password updated. Taking you to your dashboard…" />}

      {!done && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                aria-describedby="password-rules"
                className={`${authInputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShow((p) => !p)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p id="password-rules" className="text-[10px] text-slate-500 mt-1.5">
              {password.length === 0
                ? `At least ${MIN_PASSWORD_LENGTH} characters, mixing letters, numbers or symbols.`
                : verdict.ok
                  ? "Strong enough."
                  : verdict.problems[0]}
            </p>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
              Confirm new password
            </label>
            <input
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
            />
            {mismatch && <p className="text-[10px] text-amber-300 mt-1.5">Both passwords must match.</p>}
          </div>

          <Button
            type="submit"
            disabled={isLoading || !verdict.ok || password !== confirm}
            className="w-full flex items-center justify-center gap-2 text-xs"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            {isLoading ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
