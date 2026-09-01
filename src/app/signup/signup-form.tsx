"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestAccountAction, type RequestAccountState } from "@/lib/signup-actions";

const initialState: RequestAccountState = { error: null, success: false };

export function SignupForm({ branchCodes }: { branchCodes: string[] }) {
  const [state, formAction, pending] = useActionState(requestAccountAction, initialState);

  if (state.success) {
    return (
      <div className="mt-5 space-y-3">
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Request submitted — HQ will review it. You&apos;ll be able to sign in once it&apos;s approved.
        </div>
        <Link href="/login" className="block text-center text-sm font-medium text-slate-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-3">
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-slate-600">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="branch" className="block text-xs font-medium text-slate-600">
          Branch
        </label>
        <select
          id="branch"
          name="branch"
          required
          defaultValue=""
          className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Choose a branch…
          </option>
          {branchCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
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
          placeholder="letters, numbers, . _ -"
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
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
        {pending ? "Submitting…" : "Request account"}
      </button>

      <Link href="/login" className="block text-center text-xs text-slate-500 hover:underline">
        Already have an account? Sign in
      </Link>
    </form>
  );
}
