"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { signInWithPassword } from "./actions";

interface LoginFormProps {
  nextUrl: string;
  /** A message passed in the URL, such as "Account created. Please sign in." */
  notice?: string;
}

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const INITIAL_STATE: ActionState = { status: "idle" };

export function LoginForm({ nextUrl, notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInWithPassword, INITIAL_STATE);
  const signupHref = nextUrl && nextUrl !== "/" ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup";

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={nextUrl} />

      {notice && state.status === "idle" ? <Notice variant="info">{notice}</Notice> : null}

      <Field id="email" label="Email address" required>
        <Input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>

      <Field id="password" label="Password" required>
        <Input type="password" name="password" required autoComplete="current-password" />
      </Field>
      <p className="-mt-2 text-sm">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>

      {state.message ? (
        <Notice variant={state.status === "error" ? "error" : "success"}>{state.message}</Notice>
      ) : null}

      <Button type="submit" fullWidth loading={pending} loadingText="Signing in">
        Sign in
      </Button>

      <p className="text-center text-sm text-daet-ink/80">
        New here?{" "}
        <Link href={signupHref} className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
