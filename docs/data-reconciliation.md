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

Source: pipeline audit of `raw_upload_rows` vs `scom205_snapshots` / `ssrv089_snapshots`,
run 2026-09-04, **refreshed against live data 2026-09-09** (latest data day: 8 Sep).
Going forward the upload date is computed — one date for every branch (see
`src/lib/reporting-date.ts`, deployed 2026-09-09) — so the split-date problems below
should stop recurring; the September mess still needs the catch-up uploads.
Figures are ₹. Status key: ☐ open · ⏳ chasing branch · 📥 file received · ✅ resolved.

---

## September · went dark after 3 Sep  →  GUS + BPU + Total Revenue MTD **blank** on the live dashboard

No scom205 / Service Info / Part Sale / SSRV089 uploaded since **3 Sep**. With no scom205
for the current data day (8 Sep), these branches show nothing for GUS/BPU/Total Revenue —
the bigger problem than the accessories deduction below.

| ☐ | Branch | Last upload | Fix |
|---|--------|-------------|-----|
| ☐ | **KT01A** | 3 Sep — every report type | Upload 4 + 6 + 7 + 8 Sep (a single 4-Sep-to-date cumulative scom205 + SSRV089 is fine) |
| ☐ | **KT01B** | 3 Sep — every report type | as above |
| ☐ | **TI01B** | 3 Sep — every report type | as above |
| ☐ | **KL01B** | scom205 1 Sep; Part Sale never; B&P-only | Upload scom205 + Part Sale + SSRV089-BP for 2 Sep onward |

## September · SSRV089-General days missing  →  GUS Labour / Parts MTD **overstated**

Those days' Accessories sales are never subtracted from scom205's GUS revenue.
Expected days on file: **1, 2, 3, 4, 6, 7, 8** (5th was a Saturday holiday).

| ☐ | Branch | On file | Missing | Note |
|---|--------|---------|---------|------|
| ☐ | **KT01A / KT01B / TI01B** | 3 | 1,2,4,6,7,8 | dark since 3 Sep (section above) |
| ☐ | **TI01C** | 6,7,8 | 1,2,3,4 | ≈4 days undeducted |
| ☐ | **KY01A** | 3,6,7,8 | 1,2,4 | **+ roster gap** — only "Nibu B" listed at `/data`, verify |
| ☐ | **TR01A** | 1,3,4,7,8 | 2,6 | ≈2 days undeducted |
| ☐ | **KL01A** | 3,4,7,8 | 1,2,6 | 1–2 fold into its 3 Sep cumulative; owes 6 |
| — | **PH01A / TL01A / TR01C** | 1,2,3,4,7,8 | 6 only | the light Sunday — leave unless per-day accuracy matters |
| — | **CO01A** | 1,2,3,6,7,8 | 4 | folded into its 6 Sep upload (holiday section) |

✅ **MV01A** — was "no September SSRV089-General at all"; now has all 7 days (1–4, 6–8). Resolved 2026-09-09.
   (Its **scom205** is only on 7 + 8 Sep, though — GUS/BPU MTD was blank 1–6 Sep; current 8 Sep view is fine.)

## Accessories roster name mismatches  →  GUS Parts / Labour MTD **overstated**

The roster (`/data`) matches DMS `Close SA Name` exactly (whitespace + case
normalised only). A middle initial the DMS drops = no match = that person's
Accessories sales never subtracted. Cross-check run 2026-09-08.

A roster fix touches **two** stored figures — recompute both from raw rows on file (no re-upload):
- `node scripts/recompute-ssrv089-accessories.mjs <BRANCH> [--commit]` — the GUS Parts/Labour deduction
- `npx tsx scripts/recompute-service-info-vas.mts <BRANCH> [--commit]` — VAS bill revenue (accessories-staff T-Gloss rows are excluded from it too)

| Status | Branch | Roster → DMS | Sept impact (deduction that was missing) | Action |
|---|--------|-------------|------------------------------------------|--------|
| ✅ done | **PH01A** | `Santhosh V M` → `Santhosh M` | parts ₹21,893 · labour ₹37 · VAS ₹0 (snapshots already excluded him) | roster fixed + SSRV089 recomputed 2026-09-08 (3 Sep file was Santhosh-only, read 0/0); VAS checked 2026-09-09, no change |
| ✅ done | **TI01A** | `Anoop P M` → `Anoop M` (confirmed same person) | parts **₹1,25,424** · labour **₹69,254** · **VAS ₹73,799** (3, 4, 7 Sep snapshots) | roster fixed + SSRV089 recomputed 2026-09-08; VAS recomputed 2026-09-09 (`recompute-service-info-vas.mts`) |
| ✅ done | **KT01A** | `Prasanth R Shenoy` → `Prasanth Shenoy` (same person, still employed) | billing heavily in Sept — **₹8,69,026 part · ₹1,26,306 labour** SSRV089 MTD (30 lines, biggest 8 Sep ₹4.32 L / 9 Sep ₹2.39 L); all captured | roster fixed 2026-09-08; re-checked 2026-09-10 — every Sept SSRV089 snapshot == roster-matched total, VAS recompute Δ 0. No action. |
| — no fix | **TR01A** | `Ratheeshkumar M T` vs `Ratheesh S` | — | branch confirms **different people**; roster entry `Ratheeshkumar M T` has no DMS match — verify still employed |
| ✅ done | **CO01B** | `Sijo M Joy` — left the company | Aug only (4 rows, 28 Aug) — closed month, not corrected | removed from roster 2026-09-08 |

### Roster names with no DMS match anywhere — ✅ resolved 2026-09-09
CO01B (`Aneesh K.P.`, `Ansal C K`), IR01A (`Denny A B`), KL01A (`Hari S Nampoothiri`, `Vipin V P`) —
user confirms all still employed Accessories staff; they just haven't billed any accessories
work yet, so there's no `Close SA Name` to match against. Keep them on the roster. Watch for a
middle-initial spelling mismatch (as with TI01A/PH01A) the first time each one bills.

## September · per-day split wrong  →  MTD total OK, per-day view + daily delta off

A single 3 Sep upload that actually holds 1–3 Sep — MTD counts each row once (in the "3 Sep"
bucket), but the 1 & 2 Sep per-day snapshots are blank/zero.

| ☐ | Branch | State (2026-09-09) |
|---|--------|--------------------|
| ✅ | **IR01A** | Resolved 2026-09-11 — the 8 Sep upload turned out to be a fresh 1–8 Sep cumulative (real 4 + 5 Sep filled in). Superseded the 3 Sep and 7 Sep snapshots, which were deleted to stop the double-count. See "Resolved" table below. |
| ☐ | **KL01A** | 3 Sep upload = 1–3 Sep; has separate 4, 7, 8. Owes 1, 2 (split) + 6. |
| ☐ | **TI01A** | 3 Sep upload = 1–3 Sep; has separate 4, 6, 7, 8 (correct). Only 1 & 2 per-day are blank — MTD fine. |
| ☐ | **TI01B** | 3 Sep upload = 1–3 Sep, then nothing — see "went dark" above. |

## September · 4–6 Sep holiday uploads  →  MTD OK, daily dates off

5 Sep = Saturday holiday (no uploads); 6 Sep = Sunday (a trickle of jobs). These branches folded the
4th + the 6th into **one upload under a single date** — one upload, so no double-count and MTD is
correct; only the per-day dates and any today-vs-yesterday delta are off. **This class won't recur** —
the computed report date (deployed 2026-09-09) gives every branch one date per round.

| ☐ | Branch | The single upload holds | Filed under |
|---|--------|------------------------|-------------|
| ☐ | **CO01A** | 4th + 6th | 6 Sep |
| ☐ | **KY01A** | 4th + 6th | 6 Sep |
| ☐ | **TI01C** | 4th + 5th + 6th | 6 Sep |
| ☐ | **TL01A** | 4th + 6th | 4 Sep |
| ☐ | **TI01A** | 5th + 6th (its 4 Sep upload is separate and correct) | 6 Sep |

Clean for 4–6 Sep: **CO01B** (two proper separate uploads), PH01A, TR01A, TR01B, TR01C.

## September · resolved

| ✅ | Branch | Was | Now |
|---|--------|-----|-----|
| ✅ | **CO01A** | scom205 for 3 Sep was a copy of 2 Sep | Self-corrected — fresh 6/7/8 Sep scom205 on file, current MTD right. Only the historical 3 Sep view shows 2 Sep's KPI. Closed 2026-09-09. |
| ✅ | **MV01A** | No September SSRV089-General at all | All 7 days on file (see section above). Closed 2026-09-09. |

## August · double-counted  →  GUS Labour / Parts MTD read **low** (closed month)

A cumulative export plus daily exports means some job orders are summed 2–3× in the Accessories deduction.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01A** | 14 job orders appear on 2–3 different upload dates in August | Re-upload August SSRV089 as clean, non-overlapping daily files | deduction inflated → MTD understated |
| ☐ | **TI01A** | 6 job orders appear on 2 upload dates in August | Re-upload August SSRV089 as clean daily files | deduction inflated → MTD understated |
| ☐ | **CO01B** | The `Cost & Sale Aug 1 to 28` cumulative file was saved for both 27 and 28 Aug | Re-upload 27 & 28 Aug as single-day files (delete the duplicate snapshot) | ≈½ month of accessories double-deducted for that span |

## August · Service Info VAS bill revenue — **overstated** (closed month, deferred 2026-09-09)

Two issues, both pre-date the 1 Sep fixes; September VAS is clean (only TI01A, fixed 2026-09-09). User: leave August.

1. **VAS accessories-staff exclusion never ran in August** — parser matched the wrong column name (`Close SA Name` vs `Close Service Advisor Name`) until 2026-09-01. No August snapshot excludes accessories-staff T-Gloss rows. Re-deriving the real Aug-28 month-to-date files: KT01A −₹3.35 L, TI01A −₹2.18 L, PH01A −₹28 K (only these three uploaded a full Aug-28 file).
2. **Phantom August snapshots** — 11 branches hold an August date (Aug 29 for most, **Aug 28 for CO01B**) with a `vas_revenue` value but **zero raw rows** (bootstrap-cleanup left the snapshot, deleted the raw rows). Each double-counts a day into that branch's Aug VAS MTD: **CO01B ₹31.2 L**, others ₹13 K–₹1.2 L.

Fix when revisiting August: delete the phantom snapshots; decide whether to re-derive the Aug-28 bootstrap VAS. `scripts/recompute-service-info-vas.mjs <BRANCH> 2026-08-01` shows both.

## Resolved

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **CO01B** | 2 Sep upload was a partial export (19 rows, 4 advisors, no Accessories staff) | Re-parsed the correct 201-row file; snapshot + raw rows replaced 2026-09-04 (`scripts/fix-co01b-sep2-ssrv089.mjs`) | Acc. labour 0 → ₹51,813 · GUS Labour MTD 14,95,336 → **14,43,523** · GUS Parts MTD 28,92,970 → **28,39,440** |
| ✅ | **CO01B** | 2 Sep **service-info** GS and BP files were uploaded into each other's slots (3 Sep). The 25-row BP file went to the GS slot → `service_info` snapshot for 2 Sep parsed as all zeros; the real 367-row GS file (13 wheel bal, 19 align, 7 evaporator, 112 T-Gloss lines) sat unparsed in the `service_info_bp` slot. Only that one file-pair, only that branch/day (full scan). part_sale / ssrv089 / scom205 for the day were fine. | Re-parsed the GS file from the BP slot into the 2 Sep `service_info` snapshot + raw rows; reconstructed the BP content back into the `service_info_bp` slot. 2026-09-08 (`scripts/fix-co01b-sep2-swap.mts`). | CO01B 2 Sep: WB 0 → **13**, WA 0 → **19**, evaporator 0 → **7**, brake skim 0 → **1**, VAS bill revenue 0 → **₹1,22,082**. MTD now WB **70**, WA **94** (matches the branch's own count). |
| ✅ | **IR01A** | The 1–3 Sep cumulative "SEP 2026" export was uploaded a 2nd time filed as 6 Sep, on top of the existing 3 Sep snapshot — Sept 1–3 counted twice for `service_info` VAS counts and the `ssrv089` accessories deduction | Deleted the 6 Sep `part_sale` / `service_info` / `ssrv089` snapshots + raw rows 2026-09-07 (`scom205` left — read straight, harmless) | IR01A Sept 1–3 no longer doubled; still owes real Sept 4 + 6 (above) |
| ✅ | **IR01A** | Repeat of the above on **7 Sep** — the "SEP 2026" cumulative uploaded again, filed as 7 Sep, across service_info / ssrv089-GS / part_sale / scom205. Double-counted Sept 1–3 again; scom205 frozen at 3 Sep. | Branch had the correct single-day "SEP 07" files. Replaced the 7 Sep snapshots + raw rows from those (`scripts/fix-ir01a-sep7.mts`), added the BP raw uploads, deleted the phantom 6 Sep scom205. 2026-09-08. | 7 Sep now real: wheel bal/align 2/2, VAS ₹10,423, accessories ₹22,153/₹9,440; scom205 GUS MTD ₹19.39 L/₹7.74 L, BPU ₹2.07 L/₹1.21 L. |
| ✅ | **IR01A** | 3rd occurrence, 8 Sep — the "Cost and Sales Report - GS" (SSRV089) file uploaded for 8 Sep was actually a fresh **1–8 Sep cumulative** (527 rows; real 4 Sep full + real 5 Sep for the first time). Landed on the 8 Sep snapshot slot on top of the still-live 3 Sep (1–4 cumulative) and 7 Sep snapshots → real days 1,2,3,4(partial),7 accessories double-counted. Verified row-for-row: the 8 Sep file is a strict superset of both (same job orders/amounts on the overlapping days). scom205 / part_sale / service_info untouched. | Deleted the redundant 3 Sep + 7 Sep `ssrv089` (general) snapshots + raw rows 2026-09-11 (`scripts/fix-ir01a-sep8-ssrv089-dupe.mjs --commit`), leaving 8 Sep as the sole 1–8 Sep cumulative. | Accessories deduction MTD: parts ₹6,19,674 → **₹4,34,646**, labour ₹1,47,057 → **₹99,522**. GUS Parts MTD ₹19,38,967 → **₹21,23,995**; GUS Labour MTD ₹8,65,395 → **₹9,12,930**. Also closes the "owes real 4/5 Sep" item above — that data was in this file all along. |

---

## Resolved · Part Sale — External Sales filter

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **all except CO01B** | The External Sales filter matched a literal `BillNo` prefix `"AA"`. A BillNo is `[type][branch-letter]…` — `A` = external for every branch, but the branch letter varies (`AL` IR01A, `AF` KL01A, `AD` TI01A, …), so only CO01B's `AA` ever matched. Every other branch's external part sales scored ₹0. | Parser now matches first letter `A` = external, any branch; `C`/`I`/`D`/`E` types don't count (confirmed 2026-09-08). All 28 changed September part_sale snapshots re-derived from raw rows (`scripts/backfill-part-sale-external.mts`). | Adds the Part Sale side of External Sales for ~13 branches — e.g. PH01A +₹19 K, TR01C +₹23 K, TI01A +₹8 K MTD so far. Feeds "External Sales MTD" and "% on SPR I". |

## Resolved · scom205 parser

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **TR01B** | Export changed format ~3 Sep (`.xls` → `.xlsx`) and stopped filling the "Total" column group — parser read blanks, saved 0. Only TR01B affected. | Parser now falls back to the branch-specific column group when Total is blank (a single-branch export's branch total *is* the total). Snapshots 3/4/7 Sep re-derived from raw rows 2026-09-08 (`scripts/backfill-scom205.mjs`). | BPU Parts MTD 0 → **₹9.01 L**, BPU Labour MTD 0 → **₹3.72 L** as of 7 Sep |

## Resolved · service_info parser — Brake Skimming scope

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **9 branches** | Brake Skimming only matched `FR DISC (ONE SIDE) (ON-VEHICLE) - GRIND` / its opp-side combo — missed rear-axle disc grinds and every **off-vehicle** (bench-lathe) grind. Same skimming service, just a different Job Desc. | `isBrakeSkimmingDesc()` now matches the shape `(FR\|RR) DISC (ONE SIDE) ((ON\|OFF)-VEHICLE) … GRIND` (still per repair order, confirmed 2026-09-09). All Sept snapshots re-derived from raw rows (`scripts/recompute-service-info-brake-skimming.mts`). | Group MTD **54 → 76**. CO01A +7, MV01A +3, TR01C +3, CO01B +2, TI01A +2, TI01C +2, IR01A/TL01A/TR01A +1. KL01A, KT01A/B, KY01A, PH01A, TI01B unchanged. Display count only — no revenue effect. |

---

## Related open items · Part Sale

Same clean-up effort, different report — carried here so they don't get lost.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01B** | `Sale Report 01–28 Aug` cumulative counted on both 27 & 28 Aug | Delete the 27 Aug `part_sale` snapshot (28 Aug already covers the span) | External Sales (parts side) overstated ≈ ₹1.02 L for August |
| ☐ | _multiple_ | 10 CSV upload-days (late Aug / early Sep) have quote-shifted rows. Parser fixed forward (commit `ff53a91`); history not recoverable without re-upload | Re-upload those days if their other metrics matter | minor · isolated rows · no material External Sales effect |
