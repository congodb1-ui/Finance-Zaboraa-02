'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LandingSkeleton } from '../../components/landing/LandingSkeleton';
import { useAuth } from '../../lib/auth';

export default function PublicLandingPage() {
  const { isAuthenticated, isLoading, signInWithGoogle } = useAuth();
  const router = useRouter();

  // If already authenticated: redirect to /dashboard immediately (no flash)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (typeof window !== 'undefined' && router?.push) {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLoginClick = async () => {
    try {
      await signInWithGoogle('/dashboard');
    } catch (err) {
      console.error('Google Sign-in failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1120]">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <LandingSkeleton onLoginClick={handleLoginClick} />;
}
