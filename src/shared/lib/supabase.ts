import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

// Admin / Service Role Client (Bypasses RLS for system workflows like Vapi Webhooks)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    // Next.js's App Router patches the server-side global `fetch` to
    // cache requests by default (its Data Cache), and supabase-js makes
    // its REST calls through that same global fetch — so every read
    // through this client was silently getting frozen at whatever it
    // returned the first time a given URL was requested in a server
    // process, regardless of what changed in the database afterward.
    // Found by re-seeding live data and watching a route keep returning
    // the pre-edit content across repeated calls to the same process.
    // This client's data is never meant to be cached implicitly —
    // anywhere caching is wanted, RedisCache does it explicitly.
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }),
  },
});
