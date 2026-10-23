"use client";

import { useActionState, useState } from "react";
import { signInWithPassword } from "./actions";

interface LoginFormProps {
  nextUrl: string;
}

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const INITIAL_STATE: ActionState = { status: "idle" };

export function LoginForm({ nextUrl }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInWithPassword, INITIAL_STATE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={nextUrl} />

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
          autoComplete="current-password"
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          placeholder="••••••••"
        />
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
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm text-daet-ink/70">
        Don't have an account?{" "}
        <a href="/signup" className="font-bold text-daet-forest underline underline-offset-4">
          Sign up
        </a>
      </p>
    </form>
  );
}
