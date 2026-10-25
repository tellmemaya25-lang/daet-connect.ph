"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function signUpWithPassword(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const fullName = formData.get("fullName");
  const next = safeNextPath(formData.get("next"));

  if (typeof email !== "string" || !email) {
    return { status: "error", message: "Email is required." };
  }
  if (typeof password !== "string" || !password || password.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." };
  }
  if (typeof fullName !== "string" || !fullName) {
    return { status: "error", message: "Full name is required." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo: undefined,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        return { status: "error", message: "This email is already registered. Try signing in instead." };
      }
      return { status: "error", message: error.message };
    }

    if (!data.user) {
      return { status: "error", message: "Account creation failed. Please try again." };
    }

    // Auto sign-in after signup
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // If auto sign-in fails, just redirect to login
      redirect(`/login?message=${encodeURIComponent("Account created. Please sign in.")}&next=${encodeURIComponent(next)}`);
    }

    // Successfully signed in: go back to where the visitor was headed
    redirect(next);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return { status: "error", message: "Sign up failed. Please try again." };
  }
}
