"use client";

import { useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { NOT_CONNECTED_REASONS } from "@/lib/bp-referrals/not-connected-reasons";

/** The reason select + conditional "other" text box shared by the queue
 * page's NotConnectedButton and the urgent-contact popup — same `reason`/
 * `remark` form fields either way, so markNotConnectedAction handles both
 * (2026-10-20, the user's call for a structured breakdown). */
export function NotConnectedReasonFields({ textareaClassName }: { textareaClassName: string }) {
  const [reason, setReason] = useState("");

  return (
    <>
      <div>
        <span className={eyebrow}>Reason (required)</span>
        <select
          name="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${control} mt-1 w-full px-2`}
        >
          <option value="">Choose a reason…</option>
          {NOT_CONNECTED_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {reason === "other" ? (
        <div className="mt-2">
          <span className={eyebrow}>Describe what happened (required)</span>
          <textarea name="remark" required rows={2} placeholder="e.g. no answer, wrong number…" className={textareaClassName} />
        </div>
      ) : null}
    </>
  );
}
