import type { Metadata } from "next";
import { PlanView } from "@/app/(subsystems)/tours/plan/view";

export const metadata: Metadata = { title: "Plan your trip", description: "Build a day-by-day Daet itinerary that fits opening hours and your budget." };

type PageProps = { searchParams: Promise<{ describe?: string }> };

export default function PlanPage({ searchParams }: PageProps) {
  // Works signed out as well as signed in, so the proxy does not send visitors
  // away from it; the frame around it is the signed-in one either way.
  return <PlanView searchParams={searchParams} />;
}
