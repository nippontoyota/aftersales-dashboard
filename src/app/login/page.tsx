"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions";
import { ThemeToggle } from "@/components/theme-toggle";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas text-fg">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6">
        <h1 className="text-base font-semibold text-fg">Aftersales Admin Portal</h1>
        <p className="mt-1 text-sm text-fg-subtle">Nippon Toyota internal system.</p>

        <form action={formAction} className="mt-5 space-y-3">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-fg-muted">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-3 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-fg-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-3 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>

          {state.error ? (
            <p role="alert" aria-live="assertive" className="text-xs text-bad">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-9 w-full rounded bg-accent text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
