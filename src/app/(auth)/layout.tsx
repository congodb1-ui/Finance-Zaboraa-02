import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { AuthNavShell } from '../../components/navigation/AuthNavShell';

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Server Component Auth Guard wrapper for all (auth) pages
 * Ensures no page under (auth)/ is accessible without a valid Supabase session
 * Injects persistent left sidebar on desktop and bottom tab bar on mobile
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

  return <AuthNavShell>{children}</AuthNavShell>;
}
