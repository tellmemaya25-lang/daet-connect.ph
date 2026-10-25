'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function LogoutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setFailed(false);

    try {
      const response = await fetch('/auth/logout', { method: 'POST' });

      if (response.ok) {
        router.push('/');
        router.refresh();
        return;
      }
    } catch {
      // Fall through to the failure message below.
    }
    setFailed(true);
    setIsLoggingOut(false);
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={handleLogout}
        loading={isLoggingOut}
        loadingText="Signing out"
        className={`px-4 ${className}`}
      >
        Sign out
      </Button>
      <span role="status" className="sr-only">
        {failed ? 'Sign out failed. Please try again.' : ''}
      </span>
      {failed ? (
        <span aria-hidden="true" className="text-xs font-semibold text-rose-700">
          Try again
        </span>
      ) : null}
    </>
  );
}
