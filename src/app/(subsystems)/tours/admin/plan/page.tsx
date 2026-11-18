import type { Metadata } from "next";
import { PlanView } from "@/app/(subsystems)/tours/plan/view";

export const metadata: Metadata = { title: "Plan your trip" };

type PageProps = { searchParams: Promise<{ describe?: string }> };

/** The trip planner inside the admin shell. /tours/plan sends admins here. */
export default function AdminPlanPage({ searchParams }: PageProps) {
  return <PlanView searchParams={searchParams} inAdmin />;
}
