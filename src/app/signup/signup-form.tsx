"use client";

import { useActionState, useState } from "react";
import { signUpWithPassword } from "./actions";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const INITIAL_STATE: ActionState = { status: "idle" };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpWithPassword, INITIAL_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="fullName" className="block text-sm font-bold text-daet-ink">
          Full name
        </label>
        <input
          type="text"
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          placeholder="Juan Dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-bold text-daet-ink">
          Email address
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-bold text-daet-ink">
          Password
        </label>
        <input
          type="password"
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          placeholder="At least 8 characters"
        />
        <p className="mt-1 text-xs text-daet-ink/70">Must be at least 8 characters long</p>
      </div>

      {state.message && (
        <div
          className={`rounded-2xl p-4 text-sm ${
            state.status === "error"
              ? "bg-rose-50 text-rose-900"
              : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-daet-forest px-6 py-3 text-sm font-black text-white transition hover:bg-daet-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-daet-ink/70">
        Already have an account?{" "}
        <a href="/login" className="font-bold text-daet-forest underline underline-offset-4">
          Sign in
        </a>
      </p>
    </form>
  );
}
