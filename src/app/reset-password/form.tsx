"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { setNewPassword } from "./actions";

const INITIAL = { status: "idle" as const };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, INITIAL);
  return (
    <form action={formAction} className="mt-6 space-y-5">
      <Field id="password" label="New password" required hint="At least 8 characters.">
        <Input type="password" name="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field id="confirm" label="Type it again" required>
        <Input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
      </Field>
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}
      <Button type="submit" fullWidth loading={pending} loadingText="Saving">
        Save new password
      </Button>
    </form>
  );
}
