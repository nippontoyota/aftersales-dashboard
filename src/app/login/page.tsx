"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "@/lib/actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6">
        <h1 className="text-base font-semibold text-slate-900">Aftersales Admin Portal</h1>
        <p className="mt-1 text-sm text-slate-500">Nippon Toyota internal system.</p>

        <form action={formAction} className="mt-5 space-y-3">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-slate-600">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-600">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          {state.error ? (
            <p role="alert" aria-live="assertive" className="text-xs text-red-600">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-9 w-full rounded bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>

          <Link href="/signup" className="block text-center text-xs text-slate-500 hover:underline">
            Need an account? Request one
          </Link>
        </form>
      </div>
    </div>
  );
}
