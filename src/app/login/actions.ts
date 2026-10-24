"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function signInWithPassword(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = formData.get("next");

  if (typeof email !== "string" || !email) {
    return { status: "error", message: "Email is required." };
  }
  if (typeof password !== "string" || !password) {
    return { status: "error", message: "Password is required." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { status: "error", message: "Invalid email or password." };
    }

    redirect(safeNextPath(next));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { status: "error", message: "Sign in failed. Please try again." };
  }
}
