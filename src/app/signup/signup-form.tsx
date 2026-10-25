"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { signUpWithPassword } from "./actions";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const INITIAL_STATE: ActionState = { status: "idle" };

export function SignupForm({ nextUrl = "/" }: { nextUrl?: string }) {
  const [state, formAction, pending] = useActionState(signUpWithPassword, INITIAL_STATE);
  const loginHref = nextUrl && nextUrl !== "/" ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login";

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={nextUrl} />

      <Field id="fullName" label="Full name" required>
        <Input type="text" name="fullName" required autoComplete="name" placeholder="Juan Dela Cruz" />
      </Field>

      <Field id="email" label="Email address" required>
        <Input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>

      <Field id="password" label="Password" required hint="At least 8 characters.">
        <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
      </Field>

      {state.message ? (
        <Notice variant={state.status === "error" ? "error" : "success"}>{state.message}</Notice>
      ) : null}

      <Button type="submit" fullWidth loading={pending} loadingText="Creating your account">
        Create account
      </Button>

      <p className="text-center text-sm text-daet-ink/80">
        Already have an account?{" "}
        <Link href={loginHref} className="font-bold text-daet-forest underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
