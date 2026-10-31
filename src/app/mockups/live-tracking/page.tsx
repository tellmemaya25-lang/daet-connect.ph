import type { Metadata } from "next";
import { PageFrame } from "@/components/ui/page-frame";
import { LiveTrackingMockup } from "./live-tracking-mockup";

export const metadata: Metadata = {
  title: "Live tour tracking (mockup)",
  robots: { index: false, follow: false },
};

/** Design mockup only: scripted sample data, no database or location access. */
export default function LiveTrackingMockupPage() {
  return (
    <PageFrame>
      <LiveTrackingMockup />
    </PageFrame>
  );
}
