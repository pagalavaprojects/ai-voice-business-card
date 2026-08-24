"use client";

import React, { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/shared/ui/button";
import { AuthShell, AuthError, AuthNotice, AuthLink, authInputClass } from "@/features/auth/components/AuthShell";
import { assessPassword, MIN_PASSWORD_LENGTH } from "@/features/auth/lib/passwordPolicy";

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
 * The new password lives in component state only until the request returns,
 * and is never sent anywhere except Supabase's own updateUser.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
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
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setSessionState(data.user ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setSessionState("missing");
      });
    return () => {
      cancelled = true;
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
      // Clear the entered value as soon as it is no longer needed.
      setPassword("");
      setConfirm("");
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
    <AuthShell title="Choose a new password" footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
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
