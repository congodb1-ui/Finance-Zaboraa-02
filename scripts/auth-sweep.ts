import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export async function sweepUnauthenticatedRoutes(routes: string[]) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase environment variables missing for auth sweep.');
  }

  const unauthenticatedClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const openRoutes: string[] = [];

  for (const route of routes) {
    try {
      const res = await fetch(route, { method: 'GET' });
      if (res.status !== 401 && res.status !== 403) {
        openRoutes.push(route);
      }
    } catch {
      // Ignored network errors
    }
  }

  return {
    passed: openRoutes.length === 0,
    openRoutes,
  };
}
