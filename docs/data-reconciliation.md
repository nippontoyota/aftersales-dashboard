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

Source: pipeline audit of `raw_upload_rows` vs `scom205_snapshots` / `ssrv089_snapshots`, run 2026-09-04,
re-checked for the 4–6 Sep uploads 2026-09-07.
Figures are ₹. Status key: ☐ open · ⏳ chasing branch · 📥 file received · ✅ resolved.

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
| ☐ | **TI01C** | No September SSRV089-General uploaded at all | Upload full month-to-date SSRV089-General | whole-month deduction missing · scom205 GUS labour ₹1.22 L |

## Accessories roster name mismatches  →  GUS Parts / Labour MTD **overstated**

The roster (`/data`) matches DMS `Close SA Name` exactly (whitespace + case
normalised only). A middle initial the DMS drops = no match = that person's
Accessories sales never subtracted. Cross-check run 2026-09-08.

Recompute after a roster fix: `node scripts/recompute-ssrv089-accessories.mjs <BRANCH> [--commit]`
(re-derives the deduction from raw rows already on file — no re-upload).

| Status | Branch | Roster → DMS | Sept impact (deduction that was missing) | Action |
|---|--------|-------------|------------------------------------------|--------|
| ✅ done | **PH01A** | `Santhosh V M` → `Santhosh M` | parts ₹21,893 · labour ₹37 | roster fixed + recomputed 2026-09-08 (3 Sep file was Santhosh-only, read 0/0) |
| ✅ done | **TI01A** | `Anoop P M` → `Anoop M` (confirmed same person) | parts **₹1,25,424** · labour **₹69,254** | roster fixed + recomputed 2026-09-08 |
| ✅ done | **KT01A** | `Prasanth R Shenoy` → `Prasanth Shenoy` (same person, still employed) | none yet — hasn't billed since Aug | roster fixed 2026-09-08; no recompute needed |
| — no fix | **TR01A** | `Ratheeshkumar M T` vs `Ratheesh S` | — | branch confirms **different people**; roster entry `Ratheeshkumar M T` has no DMS match — verify still employed |
| ✅ done | **CO01B** | `Sijo M Joy` — left the company | Aug only (4 rows, 28 Aug) — closed month, not corrected | removed from roster 2026-09-08 |

### Roster names with no DMS match anywhere — verify still Accessories staff, else remove from `/data`
- **CO01B**: `Aneesh K.P.`, `Ansal C K`
- **IR01A**: `Denny A B`
- **KL01A**: `Hari S Nampoothiri`, `Vipin V P`

## September · verify  →  MTD total likely OK, per-day split wrong

One upload on 3 Sep that actually contains several days of invoices. The month-to-date deduction is
complete; only the per-day split and the branch Daily Report view are off.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **IR01A** | 3 Sep upload contains all of 1–3 Sep. 7 Sep was fixed 2026-09-08 (see Resolved). Still owes **real Sept 4, 5 and 6** data. | Branch uploads 4 + 5 + 6 Sep as separate daily files | 1–3 Sep and 7 Sep OK; 4–6 Sep missing (VAS/volume/accessories under-counted for those 3 days) |
| ☐ | **KL01A** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |
| ☐ | **TI01A** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |
| ☐ | **TI01B** | Single 3 Sep upload contains all of 1–3 Sep | Optional: re-upload split by day | MTD total OK · per-day view wrong |

## September · other

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01A** | scom205 (Monthly KPI) for 3 Sep is identical to 2 Sep — the 2 Sep KPI file looks re-uploaded for the 3rd, not refreshed | Re-upload the correct 3 Sep scom205 KPI file | CO01A GUS + BPU MTD frozen at 2 Sep values |

## September · 4–6 Sep holiday uploads  →  MTD OK, daily dates off

5 & 6 Sep were a holiday (5th: no uploads; 6th: a small trickle of jobs). These branches folded the
4th's working day + the 6th's trickle into **one upload under a single date** — one upload, so no
double-count and MTD is correct; only the per-day snapshot dates and any today-vs-yesterday delta are
wrong for those branches on the 4th/6th. Re-upload split by day only if per-day accuracy matters.

| ☐ | Branch | The single upload holds | Filed under |
|---|--------|------------------------|-------------|
| ☐ | **CO01A** | 4th + 6th | 6 Sep |
| ☐ | **KY01A** | 4th + 6th | 6 Sep |
| ☐ | **TI01C** | 4th + 5th + 6th | 6 Sep |
| ☐ | **TL01A** | 4th + 6th | 4 Sep |
| ☐ | **TI01A** | 5th + 6th (its 4 Sep upload is separate and correct) | 6 Sep |

Clean for 4–6 Sep: **CO01B** (two proper separate uploads — 4th full day, 6th small), PH01A, TR01A, TR01B, TR01C.
BA Tool: 3 Sep (uploaded 4th) then 6 Sep (uploaded 7th), 4th & 5th skipped — normal, it's MTD-cumulative.

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
| ✅ | **IR01A** | The 1–3 Sep cumulative "SEP 2026" export was uploaded a 2nd time filed as 6 Sep, on top of the existing 3 Sep snapshot — Sept 1–3 counted twice for `service_info` VAS counts and the `ssrv089` accessories deduction | Deleted the 6 Sep `part_sale` / `service_info` / `ssrv089` snapshots + raw rows 2026-09-07 (`scom205` left — read straight, harmless) | IR01A Sept 1–3 no longer doubled; still owes real Sept 4 + 6 (above) |
| ✅ | **IR01A** | Repeat of the above on **7 Sep** — the "SEP 2026" cumulative uploaded again, filed as 7 Sep, across service_info / ssrv089-GS / part_sale / scom205. Double-counted Sept 1–3 again; scom205 frozen at 3 Sep. | Branch had the correct single-day "SEP 07" files. Replaced the 7 Sep snapshots + raw rows from those (`scripts/fix-ir01a-sep7.mts`), added the BP raw uploads, deleted the phantom 6 Sep scom205. 2026-09-08. | 7 Sep now real: wheel bal/align 2/2, VAS ₹10,423, accessories ₹22,153/₹9,440; scom205 GUS MTD ₹19.39 L/₹7.74 L, BPU ₹2.07 L/₹1.21 L. |

---

## Resolved · scom205 parser

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **TR01B** | Export changed format ~3 Sep (`.xls` → `.xlsx`) and stopped filling the "Total" column group — parser read blanks, saved 0. Only TR01B affected. | Parser now falls back to the branch-specific column group when Total is blank (a single-branch export's branch total *is* the total). Snapshots 3/4/7 Sep re-derived from raw rows 2026-09-08 (`scripts/backfill-scom205.mjs`). | BPU Parts MTD 0 → **₹9.01 L**, BPU Labour MTD 0 → **₹3.72 L** as of 7 Sep |

---

## Related open items · Part Sale

Same clean-up effort, different report — carried here so they don't get lost.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01B** | `Sale Report 01–28 Aug` cumulative counted on both 27 & 28 Aug | Delete the 27 Aug `part_sale` snapshot (28 Aug already covers the span) | External Sales (parts side) overstated ≈ ₹1.02 L for August |
| ☐ | _multiple_ | 10 CSV upload-days (late Aug / early Sep) have quote-shifted rows. Parser fixed forward (commit `ff53a91`); history not recoverable without re-upload | Re-upload those days if their other metrics matter | minor · isolated rows · no material External Sales effect |
