import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageFrame } from "@/components/ui/page-frame";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <PageFrame>
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="display-2 text-daet-ink">We can't find that page.</h1>
        <p className="mt-4 text-daet-ink/80">
          The link may be old, or the trip or booking may have been removed. Start again from the trips.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/tours/browse">Browse trips</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Go to the home page
          </ButtonLink>
        </div>
      </div>
    </PageFrame>
  );
}
