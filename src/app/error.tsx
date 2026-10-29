"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12 text-center">
      <Link href="/" className="mx-auto mb-8 text-lg font-bold text-daet-ink">
        CONNECT-DAET
      </Link>
      <h1 className="text-4xl font-bold text-daet-ink sm:text-5xl">Something went wrong.</h1>
      <p className="mt-4 text-daet-ink/80" role="alert">
        We could not load this page. Your bookings and details are safe. Try again, or go back to the trips.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/tours/browse" variant="secondary">
          Browse trips
        </ButtonLink>
      </div>
    </main>
  );
}
