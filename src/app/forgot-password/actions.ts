"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function requestPasswordReset(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return { status: "error", message: "Enter the email address you signed up with." };
  }

  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const redirectTo = host ? `${protocol}://${host}/auth/callback?next=/reset-password` : undefined;

    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  } catch {
    return { status: "error", message: "We could not send the email right now. Please try again in a moment." };
  }

  // The same answer whether or not the address has an account, so this form
  // cannot be used to find out who is registered.
  return {
    status: "success",
    message: "If that email has an account, a reset link is on its way. It can take a few minutes to arrive.",
  };
}
