# SSRV089 Reconciliation Tracker

Branches whose **SSRV089 Cost & Sales** uploads are incomplete or doubled, throwing off the
Accessories deduction — and with it **GUS Labour MTD** and **GUS Parts MTD**.

```
GUS Labour MTD = scom205 GUS Lab Rev MTD  −  Σ daily SSRV089 accessories labour
GUS Parts  MTD = scom205 GUS SP  Rev MTD  −  Σ daily SSRV089 accessories parts
```

- A **missing** SSRV089 day under-counts the deduction → GUS Labour / Parts MTD read **high**.
- A **cumulative** file counted on two dates over-counts it → they read **low**.
- Parse rule: sum `Labour Sale` / `Part Sale` for rows where `Close SA Name` is on the branch's
  Accessories roster (`accessories_staff` table, edited at `/data`).

Fixes land by re-upload through **HQ → Upload Sheet**. Send a corrected file to have it applied
directly (as was done for CO01B — see `scripts/fix-co01b-sep2-ssrv089.mjs`).

Source: pipeline audit of `raw_upload_rows` vs `scom205_snapshots` / `ssrv089_snapshots`, run 2026-09-04.
Figures are ₹, MTD as of 3 Sep 2026. Status key: ☐ open · ⏳ chasing branch · 📥 file received · ✅ resolved.

---

## September · needs re-upload  →  GUS Labour / Parts MTD currently **overstated**

SSRV089-General for one or more days isn't on file, so those days' Accessories sales are never subtracted.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **KT01A** | Only the 3 Sep file uploaded — 1–2 Sep missing | Branch uploads 1–2 Sep (a single 1-Sep-to-date cumulative is fine) | ≈2 days' accessories not deducted |
| ☐ | **KT01B** | Only the 3 Sep file uploaded — 1–2 Sep missing | Branch uploads 1–2 Sep | ≈2 days' accessories not deducted |
| ☐ | **KY01A** | Only 3 Sep uploaded — 1–2 Sep missing; **and** the 3 Sep file matched 0 Accessories staff | Upload 1–2 Sep; verify roster at `/data` (only "Nibu B" listed) | ≈2 days undeducted + roster gap |
| ☐ | **TR01A** | Only the 3 Sep file uploaded — 1–2 Sep missing | Branch uploads 1–2 Sep | ≈2 days' accessories not deducted |
| ☐ | **TR01C** | Only the 3 Sep file uploaded — 1–2 Sep missing | Branch uploads 1–2 Sep | ≈2 days' accessories not deducted |
| ☐ | **MV01A** | No September SSRV089-General uploaded at all | Upload full month-to-date SSRV089-General | whole-month deduction missing · scom205 GUS labour ₹2.55 L |
| ☐ | **PH01A** | No September SSRV089-General uploaded at all | Upload full month-to-date SSRV089-General | whole-month deduction missing · scom205 GUS labour ₹1.52 L |
| ☐ | **TI01C** | No September SSRV089-General uploaded at all | Upload full month-to-date SSRV089-General | whole-month deduction missing · scom205 GUS labour ₹1.22 L |

## September · verify  →  MTD total likely OK, per-day split wrong

One upload on 3 Sep that actually contains several days of invoices. The month-to-date deduction is
complete; only the per-day split and the branch Daily Report view are off.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **IR01A** | Single 3 Sep upload contains 1–4 Sep invoices (incl. some dated 4 Sep) | Leave unless per-day accuracy needed; watch the 4 Sep rows vs a 3 Sep "as of" | MTD total OK · per-day view wrong |
| ☐ | **KL01A** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |
| ☐ | **TI01A** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |
| ☐ | **TI01B** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |

## September · other

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01A** | scom205 (Monthly KPI) for 3 Sep is identical to 2 Sep — the 2 Sep KPI file looks re-uploaded for the 3rd, not refreshed | Re-upload the correct 3 Sep scom205 KPI file | CO01A GUS + BPU MTD frozen at 2 Sep values |

## August · double-counted  →  GUS Labour / Parts MTD read **low** (closed month)

A cumulative export plus daily exports means some job orders are summed 2–3× in the Accessories deduction.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01A** | 14 job orders appear on 2–3 different upload dates in August | Re-upload August SSRV089 as clean, non-overlapping daily files | deduction inflated → MTD understated |
| ☐ | **TI01A** | 6 job orders appear on 2 upload dates in August | Re-upload August SSRV089 as clean daily files | deduction inflated → MTD understated |
| ☐ | **CO01B** | The `Cost & Sale Aug 1 to 28` cumulative file was saved for both 27 and 28 Aug | Re-upload 27 & 28 Aug as single-day files (delete the duplicate snapshot) | ≈½ month of accessories double-deducted for that span |

## Resolved

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **CO01B** | 2 Sep upload was a partial export (19 rows, 4 advisors, no Accessories staff) | Re-parsed the correct 201-row file; snapshot + raw rows replaced 2026-09-04 (`scripts/fix-co01b-sep2-ssrv089.mjs`) | Acc. labour 0 → ₹51,813 · GUS Labour MTD 14,95,336 → **14,43,523** · GUS Parts MTD 28,92,970 → **28,39,440** |

---

## Related open items · Part Sale

Same clean-up effort, different report — carried here so they don't get lost.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01B** | `Sale Report 01–28 Aug` cumulative counted on both 27 & 28 Aug | Delete the 27 Aug `part_sale` snapshot (28 Aug already covers the span) | External Sales (parts side) overstated ≈ ₹1.02 L for August |
| ☐ | _multiple_ | 10 CSV upload-days (late Aug / early Sep) have quote-shifted rows. Parser fixed forward (commit `ff53a91`); history not recoverable without re-upload | Re-upload those days if their other metrics matter | minor · isolated rows · no material External Sales effect |
