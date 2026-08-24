"use client";

import React, { useState, useEffect, FormEvent } from "react";
import { LogIn, Eye, EyeOff, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { AuthShell, AuthError, AuthLink, authInputClass } from "@/features/auth/components/AuthShell";
import { GENERIC_SIGN_IN_ERROR } from "@/features/auth/lib/passwordPolicy";

/** Messages for the failures that redirect here from /auth/callback. Both
 * cases mean the same thing to the visitor — the link is spent — so neither
 * says anything about whether the address behind it exists. */
const LINK_ERRORS: Record<string, string> = {
  link_invalid: "That link is missing part of its code. Open the most recent email, or request a new link.",
  link_expired: "That link has expired or was already used. Request a new one.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );

  // Read the query string from the browser rather than useSearchParams: this
  // page is otherwise fully static, and the hook would force it behind a
  // Suspense boundary for no benefit.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason && LINK_ERRORS[reason]) setError(LINK_ERRORS[reason]);
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        // Deliberately NOT authError.message: Supabase distinguishes "invalid
        // login credentials" from "email not confirmed", which together let
        // anyone test which addresses are registered. One message for every
        // failure closes that oracle.
        setError(GENERIC_SIGN_IN_ERROR);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      // The password has served its purpose either way; do not leave it
      // sitting in component state after the attempt.
      setPassword("");
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to your account"
      footer={<>New here? <AuthLink href="/signup">Create an account</AuthLink></>}
    >
      {error && <AuthError message={error} />}

      <form onSubmit={handleLogin} className="space-y-4" noValidate>
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
            disabled={isLoading}
            className={authInputClass}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <AuthLink href="/forgot-password">
              <span className="text-[10px] font-medium">Forgot password?</span>
            </AuthLink>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              className={`${authInputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant="default"
          disabled={isLoading || !email || !password}
          className="w-full flex items-center justify-center gap-2 text-xs"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {isLoading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthShell>
  );
}
