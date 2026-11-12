import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Server Component Auth Guard wrapper for all (auth) pages
 * Ensures no page under (auth)/ is accessible without a valid Supabase session
 */
export default async function AuthLayout({ children }: AuthLayoutProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no active session exists: redirect to public landing page
  if (!user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased">
      {children}
    </div>
  );
}
