"use client";

import { useRouter } from "next/navigation";

export function UploadSheetDatePicker({ selected }: { selected: string }) {
  const router = useRouter();
  
  return (
    <input
      type="date"
      value={selected}
      max={new Date().toISOString().split("T")[0]}
      onChange={(e) => {
        if (e.target.value) {
          router.push(`/upload-sheet?date=${e.target.value}`);
        }
      }}
      className="h-8 rounded border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    />
  );
}
