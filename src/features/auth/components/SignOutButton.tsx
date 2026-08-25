"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Ends the session.
 *
 * The app had no way to sign out at all: once a session cookie existed the
 * only way to drop it was clearing site data, which matters most on a shared
 * or borrowed machine — exactly where signing out is the point.
 *
 * `signOut` clears the cookie the middleware and every server route read, and
 * `router.refresh()` throws away the client-side cache of pages rendered for
 * the identity that just left, so nothing of theirs survives on screen. Even
 * if the network call fails the visitor is still sent to /login, because the
 * local session is already gone by then and leaving them on a dashboard they
 * can no longer load would be the worse failure.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
  );

  const handleSignOut = async () => {
    setIsLeaving(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // Deliberately ignored — see the note above.
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLeaving}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 px-1.5 py-1 transition-colors"
    >
      {isLeaving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {isLeaving ? "Signing out…" : "Sign out"}
    </button>
  );
}
