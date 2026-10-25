"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function setNewPassword(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (typeof password !== "string" || password.length < 8) {
    return { status: "error", message: "Choose a password with at least 8 characters." };
  }
  if (password !== confirm) {
    return { status: "error", message: "The two passwords do not match." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { status: "error", message: "This link has expired. Request a new reset link." };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { status: "error", message: "We could not save that password. Try a different one." };
  } catch {
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  redirect("/dashboard");
}
