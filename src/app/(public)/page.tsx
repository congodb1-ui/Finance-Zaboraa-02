'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LandingSkeleton } from '../../components/landing/LandingSkeleton';
import { GoogleSignInModal } from '../../components/auth/GoogleSignInModal';
import { getGoogleClientId, useAuth } from '../../lib/auth';

export default function PublicLandingPage() {
  const { isAuthenticated, isLoading, signInWithGoogle } = useAuth();
  const [isSignInOpen, setIsSignInOpen] = useState(false);
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
    setIsSignInOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1120]">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <LandingSkeleton onLoginClick={handleLoginClick} />
      <GoogleSignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        onSuccess={() => {
          setIsSignInOpen(false);
          if (typeof window !== 'undefined' && router?.push) {
            router.push('/dashboard');
          }
        }}
      />
    </>
  );
}
