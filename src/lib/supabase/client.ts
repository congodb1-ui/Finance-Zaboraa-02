import { createBrowserClient } from '@supabase/ssr';
import { createSandboxSupabaseClient } from '../sandbox-supabase'; // SANDBOX-ONLY: remove before production

// Fallback values for development / preview when Supabase credentials are yet to be configured
const supabaseUrl =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  'https://placeholder-project.supabase.co';

const supabaseAnonKey =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  'placeholder-anon-key';

export function createClient(): any {
  // SANDBOX-ONLY: use local in-memory/localStorage stub when Supabase is not configured
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    return createSandboxSupabaseClient();
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Singleton browser client instance
export const supabase = createClient();
