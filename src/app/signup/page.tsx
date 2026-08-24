"use client";

import React, { useState, FormEvent } from "react";
import { Loader2, UserPlus, Eye, EyeOff } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/shared/ui/button";
import { AuthShell, AuthError, AuthNotice, AuthLink, authInputClass } from "@/features/auth/components/AuthShell";
import { assessPassword, MIN_PASSWORD_LENGTH } from "@/features/auth/lib/passwordPolicy";

/**
 * Public sign-up.
 *
 * What this deliberately does NOT do is as important as what it does: it
 * sends no role, no company and no privilege flag. The only metadata passed
 * is the person's name. Account rows are created by the database trigger
 * (handle_new_auth_user), which writes id/email/full_name/avatar_url and
 * nothing else, so `is_platform_admin` keeps its NOT NULL DEFAULT FALSE and
 * a self-registered visitor structurally cannot arrive as a platform admin —
 * there is no field for them to set, on the client or in the payload.
 *
 * A new account likewise gets no company membership. That is intentional:
 * being added to a workspace is a decision the workspace makes, so the
 * signed-up user lands in an explicit "not linked yet" state rather than
 * silently gaining access to someone's tenant.
 */
export default function SignUpPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"confirm_email" | "signed_in" | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );

  const verdict = assessPassword(password, { email, name: fullName });
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = fullName.trim().length >= 2 && emailLooksValid && verdict.ok && password === confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailLooksValid) return setError("Enter a valid email address.");
    if (!verdict.ok) return setError(verdict.problems[0]);
    if (password !== confirm) return setError("Both passwords must match.");

    setIsLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Name only. No role, company or privilege travels from the client.
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Clear the password from state the moment it is no longer needed.
      setPassword("");
      setConfirm("");
      // A session here means confirmation is switched off for this project;
      // otherwise the address must be confirmed before signing in.
      setOutcome(data.session ? "signed_in" : "confirm_email");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (outcome) {
    return (
      <AuthShell
        title={outcome === "signed_in" ? "Account created" : "Confirm your email"}
        footer={<AuthLink href="/login">Go to sign in</AuthLink>}
      >
        <AuthNotice
          message={
            outcome === "signed_in"
              ? "Your account is ready."
              : "We've sent a confirmation link to your email. Open it to activate your account."
          }
        />
        <p className="text-[11px] text-slate-400">
          A new account isn&apos;t linked to a workspace yet. Once someone adds you to theirs, your dashboard will show
          your own activity.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Use your work email."
      footer={<>Already have an account? <AuthLink href="/login">Sign in</AuthLink></>}
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="fullName" className="block text-xs font-medium text-slate-300 mb-1.5">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Srinivasan Kandasamy"
            className={authInputClass}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5">
            Work Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={authInputClass}
          />
          {email.length > 0 && !emailLooksValid && (
            <p className="text-[10px] text-amber-300 mt-1.5">Enter a valid email address.</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1.5">
            Password
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
              aria-describedby="signup-password-rules"
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
          <p id="signup-password-rules" className="text-[10px] text-slate-500 mt-1.5">
            {password.length === 0
              ? `At least ${MIN_PASSWORD_LENGTH} characters, mixing letters, numbers or symbols.`
              : verdict.ok
                ? "Strong enough."
                : verdict.problems[0]}
          </p>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
            Confirm password
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

        <Button type="submit" disabled={isLoading || !canSubmit} className="w-full flex items-center justify-center gap-2 text-xs">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {isLoading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
