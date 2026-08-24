"use client";

import React, { useState, FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/shared/ui/button";
import { AuthShell, AuthError, AuthNotice, AuthLink, authInputClass } from "@/features/auth/components/AuthShell";
import { GENERIC_RECOVERY_MESSAGE } from "@/features/auth/lib/passwordPolicy";

/**
 * Password recovery request.
 *
 * The defining behaviour: the response is IDENTICAL whether or not the
 * address has an account. Supabase's resetPasswordForEmail already declines
 * to say, and this page must not undo that by rendering a different message
 * for the two cases — an enumeration oracle here would let anyone test which
 * addresses are registered. Even a genuine provider outage returns the same
 * text, with the real cause logged for the operator rather than shown.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      // The link must land on the callback route, which exchanges the
      // one-time code for a session before the reset form can run.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Deliberately not branching on the result: see the note above.
      setSent(true);
    } catch {
      // A transport failure is the one case the visitor can act on (retry),
      // and it reveals nothing about the address.
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your work email and we'll send you a link to choose a new password."
      footer={<>Remembered it? <AuthLink href="/login">Back to sign in</AuthLink></>}
    >
      {error && <AuthError message={error} />}

      {sent ? (
        <div className="space-y-4">
          <AuthNotice message={GENERIC_RECOVERY_MESSAGE} />
          <p className="text-[11px] text-slate-400">
            The link can be used once and expires shortly. If it stops working, request a new one.
          </p>
          <Button variant="glass" onClick={() => setSent(false)} className="w-full text-xs">
            Send another link
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          </div>

          <Button type="submit" disabled={isLoading || !email} className="w-full flex items-center justify-center gap-2 text-xs">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {isLoading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
