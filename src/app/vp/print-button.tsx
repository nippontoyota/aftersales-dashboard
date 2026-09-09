"use client";

/** "Export to PDF" = the browser's own print-to-PDF. No dependency; the
 * print stylesheet in globals.css / the `print:hidden` utilities keep the
 * chrome out of the page. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 print:hidden"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 6V2h8v4M4 12H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1M4 10h8v4H4z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Export to PDF
    </button>
  );
}
