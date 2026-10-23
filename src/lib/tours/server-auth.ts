import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthenticatedSession = {
  user: User | null;
  role: string | null;
  error: string | null;
};

export function normalizeRole(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().toLowerCase() || null;
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizeRole(value[0]);
  }

  if (value && typeof value === "object" && "role" in value) {
    return normalizeRole((value as { role?: unknown }).role);
  }

  return null;
}

/**
 * Always obtains the user from Supabase Auth and reads the role server-side.
 * Cached per request so the page frame and the page share one lookup.
 */
export const getAuthenticatedSession = cache(async function getAuthenticatedSession(): Promise<AuthenticatedSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, role: null, error: null };
  }

  const { data: roleData, error: roleError } = await supabase.rpc("get_my_role");
  if (roleError) {
    return {
      user,
      role: null,
      error: "Your account role could not be verified. Please try again later.",
    };
  }

  return { user, role: normalizeRole(roleData), error: null };
});
