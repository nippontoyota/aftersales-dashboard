"use client";

/** Toggles every row checkbox (name="vin") in the enclosing "Assign evenly"
 * form — plain DOM toggling via the native checkbox's own .form reference,
 * no selection state lifted into React (the form submission itself already
 * reads the checked boxes natively). */
export function SelectAllCheckbox({ className, name = "vin" }: { className?: string; name?: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      title="Select all"
      className={className}
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const checked = event.currentTarget.checked;
        form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((box) => { box.checked = checked; });
      }}
    />
  );
}
