"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { requestPasswordReset } from "./actions";

const INITIAL = { status: "idle" as const };

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL);
  return (
    <form action={formAction} className="mt-6 space-y-5">
      {notice && state.status === "idle" ? <Notice variant="warning">{notice}</Notice> : null}
      <Field id="email" label="Email address" required>
        <Input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>
      {state.message ? <Notice variant={state.status === "error" ? "error" : "success"}>{state.message}</Notice> : null}
      <Button type="submit" fullWidth loading={pending} loadingText="Sending">
        Send reset link
      </Button>
      <p className="text-center text-sm text-daet-ink/80">
        <Link href="/login" className="font-bold text-daet-forest underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
