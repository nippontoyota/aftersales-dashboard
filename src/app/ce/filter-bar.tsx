"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from "react";

export type FilterOption = { value: string; label: string };

const months: FilterOption[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, index) => ({ value: String(index + 1), label }));

export function FilterBar({ clearHref, active, children }: { clearHref: string; active: boolean; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function apply() {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      const text = String(value).trim();
      if (text) params.append(key, text);
    }
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  function change(event: FormEvent<HTMLFormElement>) {
    if (timer.current) clearTimeout(timer.current);
    const target = event.target as HTMLInputElement;
    if (target.name === "q") timer.current = setTimeout(apply, 400);
    else apply();
  }

  return (
    <form ref={form} action={pathname} onChange={change} onSubmit={(event) => { event.preventDefault(); apply(); }} className="mt-5 flex flex-wrap items-start gap-2 rounded-lg border border-border bg-surface p-3 shadow-card">
      {children}
      <div className="ml-auto flex h-9 items-center gap-3 px-1">
        {pending ? <span className="text-[11px] text-fg-faint" role="status">Filtering…</span> : null}
        {active ? <Link href={clearHref} scroll={false} className="text-xs font-medium text-fg-subtle hover:text-fg focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Clear</Link> : null}
      </div>
    </form>
  );
}

export function MultiSelectFilter({ label, allLabel, name, options, selected }: { label: string; allLabel: string; name: string; options: FilterOption[]; selected: string[] }) {
  return (
    <details className="group relative">
      <summary className="flex h-9 min-w-36 cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span>{selected.length ? label : allLabel}{selected.length ? <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-text">{selected.length}</span> : null}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="absolute left-0 z-40 mt-1 max-h-72 min-w-full overflow-y-auto rounded-md border border-border-strong bg-surface p-1.5 shadow-pop">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return <label key={option.value} className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2.5 py-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg">
            <input key={`${option.value}-${checked}`} type="checkbox" name={name} value={option.value} defaultChecked={checked} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
            {option.label}
          </label>;
        })}
      </div>
    </details>
  );
}

function SelectFilter({ label, allLabel, name, value, options }: { label: string; allLabel: string; name: string; value?: string; options: FilterOption[] }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select key={`${name}-${value ?? "all"}`} name={name} defaultValue={value ?? ""} className="h-9 min-w-32 rounded-md border border-border-strong bg-surface px-3 text-sm text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function MonthFilter({ value }: { value?: number }) {
  return <SelectFilter label="Latest service month" allLabel="All months" name="month" value={value ? String(value) : undefined} options={months} />;
}

export function YearFilter({ value, years }: { value?: number; years: number[] }) {
  return <SelectFilter label="Latest service year" allLabel="All years" name="year" value={value ? String(value) : undefined} options={years.map((year) => ({ value: String(year), label: String(year) }))} />;
}
