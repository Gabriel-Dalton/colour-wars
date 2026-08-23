import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Non-null when the app was built without its Supabase env vars. Surfaced in the
 * UI so a misconfigured deploy reads as a config problem instead of an opaque
 * "failed to fetch" against the string "undefined".
 */
export const supabaseConfigError =
  !url || !anonKey
    ? 'Server not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    : null;

if (supabaseConfigError && typeof window !== 'undefined') {
  console.error(
    '[colour-wars] Missing Supabase env vars. Set them in .env.local locally, ' +
      'and in Vercel under Project Settings > Environment Variables (then redeploy).'
  );
}

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing-anon-key');

/** PostgREST code for `.single()` matching no rows — i.e. a genuinely missing room. */
export const NO_ROWS = 'PGRST116';

/**
 * True when a query failed because the backend was unreachable, rather than
 * because it answered with an error.
 *
 * When the Supabase project is paused or its origin is down, the edge returns a
 * 5xx that carries no CORS headers, so the browser reports it as "No
 * 'Access-Control-Allow-Origin' header is present". supabase-js surfaces that
 * as an error with an empty `code` (it never got a PostgREST response body).
 * Distinguishing it matters: "room not found" and "we can't reach the server"
 * need different messages and different recovery.
 */
export function isOfflineError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && !error.code;
}
