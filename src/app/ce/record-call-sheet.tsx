"use client";

import { useEffect, useRef, useState } from "react";
import { UpdateForm } from "./leads/[vin]/update-form";
import { ContactLink } from "./contact-link";

export function RecordCallSheet({
  vin,
  customerName,
  contactNumber,
  attemptCount,
  className,
}: {
  vin: string;
  customerName: string;
  contactNumber: string | null;
  attemptCount: number;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Record call</button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby={`call-sheet-title-${vin}`}
          onClose={() => setOpen(false)}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}
          className="ce-call-sheet fixed inset-x-0 bottom-0 top-auto m-auto mb-0 max-h-[92dvh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-black/70"
        >
          <div className="flex max-h-[92dvh] flex-col">
            <header className="relative shrink-0 border-b border-border px-5 py-4 pl-16">
              <button type="button" onClick={close} aria-label="Close call form" className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-xl leading-none text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">×</button>
              <h2 id={`call-sheet-title-${vin}`} className="text-base font-semibold text-fg">Record customer call</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">{customerName} · <span className="font-mono">{vin}</span></p>
              <p className="mt-1 text-xs text-fg-subtle"><ContactLink value={contactNumber} /></p>
            </header>
            <div className="overflow-y-auto px-5 pb-6">
              <UpdateForm vin={vin} attemptCount={attemptCount} />
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
