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
| ☐ | **TI01C** | 6,7,8,9,10 (11 + 13 Sep deleted — recurring stale duplicates of 10 Sep, see "resolved" below) | 1,2,3,4 | ≈4 days undeducted |
| ☐ | **KY01A** | 3,6,7,8 | 1,2,4 | **+ roster gap** — only "Nibu B" listed at `/data`, verify |
| ☐ | **TR01A** | 1,2,3,4,7,8,9,10,11,13,14 | 6 | ≈1 day undeducted (also see roster fix below — `Ratheeshkumar M T` → `Ratheesh S` applied 2026-09-15, this row is now on top of that) |
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
| ✅ done | **TR01A** | `Ratheeshkumar M T` → `Ratheesh S` (confirmed same/only accessories person — `Ratheeshkumar M T` never appears in TR01A's SSRV089 export, Aug or Sep; earlier "different people" note superseded) | parts **₹2,41,100.44** · labour **₹83,851.66** · VAS **−₹69,286.76** (7 SSRV089 snapshots + 4 Service Info snapshots) | roster fixed + both recomputed 2026-09-15. GUS Parts MTD 50,72,892 → 48,31,792; still ≈₹2.63L over the vendor's Revenue Streams figure (₹45,68,977) — unexplained, separate from this fix; 6-Sep SSRV089 still not uploaded (see row above) |
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
| ✅ | **CO01A** | Service Info-GS 7 Sep was a partial upload: WB 2/WA 4/BS 1/EC 0/VAS ₹6,159 vs the DMS's true day (WB 9/WA 13/BS 1/EC 3/VAS ₹36,837, cross-checked against a fresh 1–11 Sep cumulative export the user pulled 2026-09-12) | Fixed 2026-09-12 via `scripts/fix-co01a-sep-partial-uploads.mjs --commit` — replaced the 7 Sep raw rows + snapshot with the true day's 172 rows. MTD effect: WB +7, WA +9, EC +3, VAS Achievement +₹30,678. |
| ✅ | **CO01A** | Part Sale 3 Sep was a partial upload: injector cleaner 10, DIY count 2, DIY revenue ₹466 vs the true day (11, 4, ₹932 — engine flush/synthetic oil/brake cleaning spray/external sales already matched) | Fixed 2026-09-12, same script/commit as above — replaced the 3 Sep raw rows + snapshot with the true day's 753 rows. MTD effect: injector cleaner +1, DIY count +2, DIY revenue +₹466 (informational metric only, no Total Revenue Stream impact). |
| ✅ | **TI01C** | 11 Sep uploads for scom205, SSRV089-General, and Service Info-GS were all stale duplicates of 10 Sep (identical figures + filenames) — BA Tool's own numbers show real growth that day (GUS RO 274→311, BPU RO 37→43), so the branch resubmitted yesterday's files instead of pulling fresh ones | Fixed 2026-09-12 via `scripts/fix-ti01c-sep11-duplicate-uploads.mjs --commit` — deleted the 11 Sep snapshot + 296 raw rows across all three report types, reverting to "not yet uploaded for the 11th." scom205-derived GUS/BPU Parts & Labour MTD now blank until the real file lands (was silently stuck at 10 Sep's value); Service Info MTD no longer double-counts 10 Sep (was +4 Brake Skimming, +4 Evaporator Cleaning, +₹46,084 VAS too high). TI01C still owes a real 11 Sep upload for these three. |
| ✅ | **TI01C** | Same pattern recurred — asked "is it okay now" 2026-09-15, re-checked and found the branch had resent the *same* 10 Sep files again for the 11th (after the fix above) and now also for the 13th (12 Sep folds into 13, Saturday). Hash-verified byte-identical across all three dates for scom205, SSRV089-General, and Service Info-GS; BA Tool showed real, continuing growth the whole time (GUS RO 274→311→339→359 through the 14th), confirming the branch's own reports simply weren't capturing real business, three rounds running. | Deleted the 11 Sep AND 13 Sep snapshots + 592 raw rows across all three report types (`scripts/fix-ti01c-sep11-13-duplicate-uploads.mjs --commit`), reverting both to "not yet uploaded." Script includes a pre-delete safety check that aborts if the three dates ever stop matching exactly, given how easily this recurs. TI01C now owes real uploads for 11 and 13 Sep (or one combined 11–13 Sep file, same guidance given for CO01B's Saturday fold this round) across scom205, SSRV089-General, and Service Info. | scom205-derived GUS/BPU Parts & Labour MTD blank for 11 and 13 Sep until real files land; Service Info/SSRV089 MTD no longer triple-counts the 10th's job orders/VAS entries. |
| ✅ | **TI01C** | A full-company audit 2026-09-15 found the same resend pattern had also hit TI01C's **Service Info-BP** file (missed by the fix above — BP uploads only keep a raw file blob, not parsed rows, so the earlier duplicate check never covered them). 10/11/13 Sep were byte-identical (`Service_Info_Report-TI01C-B&P.csv`, confirmed via file hash). Wheel Balancing/Brake Skimming/VAS were 0 on all three dates so unaffected, but Wheel Alignment=1 on each meant the merged (GS+BP) MTD was counting it 3× instead of once — the GS-side fix alone didn't stop this, since `mergeGsAndBp` synthesizes a standalone row from BP alone on a date with no GS snapshot. | Deleted the 11 Sep and 13 Sep `service_info_bp` snapshots + raw file records (`scripts/fix-ti01c-sep11-13-bp-duplicate.mjs --commit`), reverting both to "not yet uploaded." Left `ssrv089_bp` alone despite the same duplicate pattern there — that variant isn't read by report.ts for any calculation, so it has zero effect on any figure (confirmed by checking usage in report.ts). TI01C's real BP uploads for 11 and 13 Sep are still owed, same as the GS side. | Combined Wheel Alignment MTD 3 → **1**. No other combined field (Wheel Balancing/Brake Skimming/VAS) was affected. |
| ✅ | **TI01C** | The real Service Info-GS file finally uploaded for "13 Sep" (2026-09-15) turned out to be a cumulative export covering job orders closed on 10, 11, 12, AND 13 Sep (268 rows, verified via each row's `Job Close Date`) — a clean superset of the already-real 10 Sep snapshot (all 42 of its job orders present in the new file, zero conflicts, zero overlap with the 9th). Left alone, the 10th would double-count into MTD. | Deleted the now-redundant 10 Sep snapshot + 103 raw rows (`scripts/fix-ti01c-sep13-service-info-cumulative.mjs --commit`), leaving 13 Sep as the sole (already-cumulative) holder for the 10–13 Sep span — same remedy as the IR01A/TI01B cumulative-upload fixes. Also finally gives TI01C real 11/12 Sep data, previously missing entirely. | Brake Skimming MTD 13 → **9**; Evaporator Cleaning 14 → **10**; VAS Bill revenue ₹2,23,898 → **₹1,77,815** (−₹46,084, exactly the 10th's now-removed duplicate contribution). |
| ✅ | **TI01C** | The user then uploaded real Part Sale, SSRV089-General, and Service Info-BP files for "13 Sep" too, each turning out to be the same style of cumulative export as the GS file above — Part Sale (573 rows) a superset of both the existing 10 Sep (67/67 BillNo) and 11 Sep (60/60 BillNo); SSRV089-General (167 rows) a superset of 10 Sep (42/42 JobOrder No); Service Info-BP (93 rows, verified by parsing both raw file blobs directly since BP keeps no parsed rows) a superset of 10 Sep (9/9 Job Order No). All three would have double-counted their superseded date(s) into MTD if left as-is. | Deleted the now-redundant snapshots + raw rows/files for each (`scripts/fix-ti01c-sep13-part-sale-cumulative.mjs`, `-ssrv089-cumulative.mjs`, `-service-info-bp-cumulative.mjs`, all `--commit`), leaving 13 Sep as the sole holder per type. | Part Sale MTD: Engine Flush 61→**45**, Injector Cleaner 33→**22**, Synthetic Oil 296.2→**235.4** Ltrs, Brake Cleaning Spray 88→**69**. SSRV089 accessories deduction: parts ₹1,41,515→**₹1,34,161**, labour ₹53,432→**₹41,562** (flows into GUS Parts/Labour MTD). Combined Service Info Wheel Alignment MTD 2→**1**. |
| ✅ | **TI01C** | A full-company sweep 2026-09-15 (comparing each branch's latest vs. prior upload by unique row key) caught a **fourth** occurrence: the "14 Sep" Service Info-GS and SSRV089-General uploads were a straight resend of the original 10 Sep file (same filenames as that original upload), not even the 13th's cumulative one — every job order in both was already fully contained in the 13 Sep snapshot, contributing zero new data. | Deleted the 14 Sep service_info and ssrv089 snapshots + 165 raw rows entirely (`scripts/fix-ti01c-sep14-redundant-resend.mjs --commit`), reverting to "not yet uploaded for the 14th" — 13 Sep remains the correct, current MTD holder. | None — the deleted snapshot was pure duplication, MTD unchanged. |
| ✅ | **TI01B** | Same full-company sweep caught TI01B's "13 Sep" Part Sale upload as a full month-to-date cumulative export (730 BillNo spanning 1–12 Sep SaleDate) — their well-documented standing pattern for this report type. Clean superset of both the existing 10 Sep (602/602 BillNo) and 11 Sep (666/666 BillNo) snapshots. | Deleted the now-redundant 10 Sep and 11 Sep snapshots + 4,188 raw rows (`scripts/fix-ti01b-sep13-part-sale-cumulative.mjs --commit`), leaving 13 Sep as the sole holder. Service Info-GS and SSRV089-General for the same round were checked too and are genuinely clean, non-overlapping small daily files — no fix needed there. | Engine Flush MTD 71→**27**; Injector Cleaner 147→**51**; Synthetic Oil 1109.4→**397.3** Ltrs; Brake Cleaning Spray 396→**144**; External Sales ₹22,488→**₹7,496**. |
| ✅ | **KY01A / PH01A / TL01A / TR01A / TR01C** | "Opulent Auto Care Pvt Ltd" (a vendor buying parts from us for its own use, spelled differently at every branch) was showing up as a Part Sale Report `CustomerName` and its purchases were counting toward External Sales — 9 branches have Opulent rows total, but only these 5 have ones that both land in September and match the External Sales filter (bill type A + tracked part prefix); KL01A also has 10 Opulent rows in Sept but none match the filter, so no change there | Fixed 2026-09-12 via `scripts/recompute-part-sale-external-excluding-opulent.mjs --commit` — re-derived `external_sales` from the raw rows already on file, excluding any row whose CustomerName contains "opulent". External Sales MTD: KY01A 5,484→3,415 (−2,070), PH01A 31,653→20,704 (−10,950), TL01A 10,151→8,128 (−2,023), TR01A 33,583→30,125 (−3,458), TR01C 39,296→35,544 (−3,752). Flows straight through to each branch's Total Revenue Stream MTD. |
| ✅ | **MV01A** | Flagged 2026-09-16 via the user's Revenue Stream reconciliation sheet (dashboard External Sales ₹2,08,689 vs their sheet's ₹2,05,808 for the 15th). MV01A's "08 Sep" Part Sale Report (`0809.csv`, 147 rows) turned out to be a full, exact duplicate of rows already in the "09 Sep" file (`0909.csv`, 582 rows) — every one of the 147 rows matched on BillNo, PartNo, NetAmnt, Sale Qty, VinNo, *and* CustomerName; both uploaded in the same backfill batch (2026-09-15, same second). GUS Labour MTD was also off (+₹2,736 vs the sheet) but no matching duplicate/data issue was found there — left as an unexplained sheet-vs-dashboard variance, same category as the confirmed-correct External Sales return-netting case below. | Deleted the 08 Sep `part_sale` snapshot + 147 raw rows entirely (`scripts/fix-mv01a-sep08-part-sale-duplicate.mjs --commit`), reverting to "not yet uploaded for the 8th" — 09 Sep's snapshot remains the sole, correct holder of that data. | External Sales MTD ₹2,08,689.44 → **₹2,02,932.44** (−₹5,757, exactly the deleted day's contribution). Engine Flush/Synthetic Oil/Brake Cleaning Spray MTD also dropped slightly (09-08's rows included a few); DIY unaffected (0 either way). Residual ≈₹2,876 gap vs the sheet's ₹2,05,808 remains, same unexplained-variance category as GUS Labour above — not a further data-pipeline issue found. |
| ✅ | **TL01A** | Same Revenue Stream reconciliation sweep, 2026-09-16: dashboard External Sales ₹1,34,277.06 vs the sheet's ₹1,26,861 (+₹7,416.06). Checked for duplicate uploads (none found, no date-pair overlap), confirmed Opulent (`OPULENT AUTO CARE PRIVATE LIMITED`, ₹1,66,609.44/9 rows) is already correctly excluded, and no F-type returns exist at all this month. Two business-sounding customer names appear among the top external bills (R K MOTORS ₹50,932.76/28 rows, NATIONAL INSURANCE ₹17,864/6 rows) but neither's amount fits the gap size (excluding either would overshoot far past the sheet's figure). | **No fix — no data-pipeline issue found.** Flagged to the user 2026-09-16; residual gap left as an unexplained sheet-vs-dashboard variance, same category as MV01A's above. | None — figures unchanged. |
| ✅ | **TI01A** | Same sweep: dashboard External Sales ₹2,16,223.27 vs the sheet, ₹27,212 higher on the sheet's side. Traced almost entirely to **09-01 and 09-02 having no Part Sale Report on file for TI01A at all** (first upload is 09-03) — not a bug, just not yet filed; user is filling in the 1st/2nd from their side. Separately (unrelated to the gap — zero `A`-type bills that day, so no External Sales effect either way), found "09 Sep" (`PART SALE 09-09-2026.csv`, 108 rows) is a full, exact duplicate of rows already in "10 Sep" (`PARTS & SALES 10-09-2026.csv`) on all 6 fields (BillNo/PartNo/NetAmnt/Sale Qty/VinNo/CustomerName). | Deleted the 09 Sep `part_sale` snapshot + 108 raw rows entirely (`scripts/fix-ti01a-sep09-part-sale-duplicate.mjs --commit`), reverting to "not yet uploaded for the 9th" — 10 Sep's snapshot remains the sole, correct holder. | Engine Flush MTD 113 → **112**; Injector Cleaner 42 → **41**; Synthetic Oil 1,138.1 → **1,100.6** Ltrs; Brake Cleaning Spray 286 → **279**. External Sales unchanged (₹2,16,223.27 both before and after — 09-09 had no external-type bills). Gap vs the sheet still open pending the 1st/2nd upload. |
| ✅ | **TI01A** | The user then uploaded a combined 1st+2nd Sep file (`SPRT014_PartSaleReport-TI01A.csv`, 1,016 rows, filed as "02 Sep" — its `SaleDate` values span exactly 2 distinct days under this branch's SPRT014 date encoding). Turned out **1,010 of its 1,016 rows were already in 03 Sep's file** (`...-1788498238765_1.csv`, 1,652 rows) — user confirmed 03 Sep was already a 1st–3rd cumulative export. Only 6 rows were genuinely new (1 external `A`-type bill +₹114.95; the other 5 — a `D`-type bill's 3 lines, an `E`-type bill's 2 lines — don't match any tracked part category). | Moved the 6 unique raw rows onto 03 Sep (the correct cumulative holder), added their ₹114.95 to 03 Sep's `external_sales`, and deleted the "02 Sep" snapshot + remaining 1,010 raw rows entirely (`scripts/fix-ti01a-sep02-part-sale-cumulative.mjs --commit`) — reverting 02 Sep to "not yet uploaded" (its real data was always inside 03 Sep's cumulative). Re-ran the full date-pair overlap check afterward — clean, no remaining duplicates anywhere in September. | External Sales MTD ₹2,16,223.27 → **₹2,16,338.22** (+₹114.95, not the ~₹1.2L the redundant file's own total suggested). 01/02 Sep still show as "not uploaded" individually — their real data lives inside 03 Sep's cumulative snapshot, same as IR01A/TI01C's cumulative-upload pattern elsewhere in this doc. |
| ✅ | **TI01C** | A full-company audit 2026-09-18 found TI01C's "16 Sep" Part Sale upload (2,698 rows) was a full **1–16 Sep cumulative export** (16 distinct `SaleDate` values, verified) — a clean superset of the 8 days that already had their own standalone snapshots (3, 6, 7, 8, 9, 13, 14, 15 Sep), double-counting each into MTD. The other 8 days inside it (1, 2, 4, 5, 10, 11, 12, plus the 16th itself) were genuinely new, incidentally filling gaps the same audit had flagged as missing. | Deleted the 8 now-redundant standalone snapshots + 2,521 raw rows (`scripts/fix-ti01c-sep16-part-sale-cumulative.mjs --commit`), leaving 16 Sep as the sole (already-cumulative) holder for the 1–16 Sep span — same remedy as IR01A/TI01B/TI01A's cumulative-upload fixes above. Checked Service Info and SSRV089 for the same pattern — both clean, normal-sized daily files, no fix needed there. | External Sales MTD unaffected in total (₹1,27,244.37 both before and after — the newly-recovered days had zero qualifying `A`-type bills of their own). Engine Flush 85→**90**, Synthetic Oil 385.6→**433.1** Ltrs picked up real contributions from the previously-missing days. |

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
| ✅ | **CO01B** | Repeat of the above, this time on **10 Sep's Cost and Sales Report** (SSRV089), GS ↔ BP. The 30-row BP file (all `BPJ...` job orders) landed in the `ssrv089` (GS) slot → accessories deduction parsed as ₹0/₹0 despite the roster (Jeeshan V P / Vivek Lal T J / Antony Anoop) genuinely closing jobs that day; the real 163-row GS file (all `GSJ...`, familiar GS advisor names) sat unparsed in the `ssrv089_bp` slot. Caught because the branch confirmed the roster staff *did* close jobs on 10 Sep. part_sale / service_info / scom205 for the day were fine. | Re-parsed the GS file from the BP slot into the 10 Sep `ssrv089` (general) snapshot + raw rows; reconstructed the BP content (30 rows) back into the `ssrv089_bp` slot. 2026-09-11 (`scripts/fix-co01b-sep10-ssrv089-swap.mts`). | Accessories deduction MTD: parts ₹10,20,118 → **₹13,19,337**, labour ₹3,84,624 → **₹4,57,324**. GUS Parts MTD ₹68,83,611 → **₹65,84,392**; GUS Labour MTD ₹36,20,463 → **₹35,47,763**. |
| ✅ | **IR01A** | The 1–3 Sep cumulative "SEP 2026" export was uploaded a 2nd time filed as 6 Sep, on top of the existing 3 Sep snapshot — Sept 1–3 counted twice for `service_info` VAS counts and the `ssrv089` accessories deduction | Deleted the 6 Sep `part_sale` / `service_info` / `ssrv089` snapshots + raw rows 2026-09-07 (`scom205` left — read straight, harmless) | IR01A Sept 1–3 no longer doubled; still owes real Sept 4 + 6 (above) |
| ✅ | **IR01A** | Repeat of the above on **7 Sep** — the "SEP 2026" cumulative uploaded again, filed as 7 Sep, across service_info / ssrv089-GS / part_sale / scom205. Double-counted Sept 1–3 again; scom205 frozen at 3 Sep. | Branch had the correct single-day "SEP 07" files. Replaced the 7 Sep snapshots + raw rows from those (`scripts/fix-ir01a-sep7.mts`), added the BP raw uploads, deleted the phantom 6 Sep scom205. 2026-09-08. | 7 Sep now real: wheel bal/align 2/2, VAS ₹10,423, accessories ₹22,153/₹9,440; scom205 GUS MTD ₹19.39 L/₹7.74 L, BPU ₹2.07 L/₹1.21 L. |
| ✅ | **IR01A** | 3rd occurrence, 8 Sep — the "Cost and Sales Report - GS" (SSRV089) file uploaded for 8 Sep was actually a fresh **1–8 Sep cumulative** (527 rows; real 4 Sep full + real 5 Sep for the first time). Landed on the 8 Sep snapshot slot on top of the still-live 3 Sep (1–4 cumulative) and 7 Sep snapshots → real days 1,2,3,4(partial),7 accessories double-counted. Verified row-for-row: the 8 Sep file is a strict superset of both (same job orders/amounts on the overlapping days). scom205 / part_sale / service_info untouched. | Deleted the redundant 3 Sep + 7 Sep `ssrv089` (general) snapshots + raw rows 2026-09-11 (`scripts/fix-ir01a-sep8-ssrv089-dupe.mjs --commit`), leaving 8 Sep as the sole 1–8 Sep cumulative. | Accessories deduction MTD: parts ₹6,19,674 → **₹4,34,646**, labour ₹1,47,057 → **₹99,522**. GUS Parts MTD ₹19,38,967 → **₹21,23,995**; GUS Labour MTD ₹8,65,395 → **₹9,12,930**. Also closes the "owes real 4/5 Sep" item above — that data was in this file all along. |
| ✅ | **IR01A** | After the fix above, our GUS Parts MTD (₹21,23,995) still didn't match the branch's own figure (₹21,22,464) — a ₹1,531 / ₹7.90 gap. Traced to one row in the 8 Sep file: real 4 Sep, Job Order GSJ26-06993, closed by **"Albin James 2856"** — a name not on IR01A's Accessories roster (he's a service advisor, only row all month under that name). HQ confirmed 2026-09-11: the sale is real and should count as accessories this once, but he isn't accessories staff — so no roster change (would wrongly catch any of his ordinary SA sales too). | Added ₹1,531 / ₹7.90 directly to the 8 Sep snapshot's `accessories_part_sale` / `accessories_labour_sale` as a one-off manual amount — not roster-driven, so a future `recompute-ssrv089-accessories.mjs` run for IR01A would wipe it and need re-applying (`scripts/fix-ir01a-albin-james-onetime.mjs --commit`). | Accessories deduction MTD: parts ₹4,34,646 → **₹4,36,177**, labour ₹99,522 → **₹99,530**. GUS Parts MTD ₹21,23,995 → **₹21,22,464** (matches branch exactly); GUS Labour MTD ₹9,12,930 → **₹9,12,922**. |
| ✅ | **TI01B** | Flagged 2026-09-11 via the "Value-Added Services" audit: Evaporator Cleaning MTD showed 217, 4x+ every other branch. Cause: every September **Service Information Report - GS** upload (3/8/9/10 Sep) is a cumulative month-to-date export, not a single day — verified job-order-for-job-order, each a strict superset of the last (257→504→575→643 rows, 102→188→215→242 distinct jobs). MTD summed all 4 snapshots instead of reading the latest. Also inflated Wheel Balancing, Wheel Alignment, Brake Skimming, and VAS Bill revenue the same way. | Deleted the superseded 3/8/9 Sep `service_info` snapshots + 1,336 raw rows, leaving 10 Sep as the sole (already-cumulative) holder — same remedy as the IR01A/CO01B cumulative-upload fixes above (`scripts/fix-ti01b-sep-service-info-cumulative.mjs --commit`). | Evaporator Cleaning MTD 217 → **67**; Wheel Balancing 30 → **9**; Wheel Alignment 24 → **7**; Brake Skimming 12 → **4**; VAS Bill revenue MTD ₹12,06,938 (summed) → **₹3,82,389** (latest only). Branch quoted Evaporator Cleaning as 44 as of 9 Sep — even 67/63 doesn't match that; no cancelled/duplicate/pay-type explanation found in the file (all 63 as-of-9th rows are distinct VINs, `Cancel Flag=N`, `CASH`). Unresolved residual gap — flagged to the user 2026-09-11, awaiting the branch's basis for "44". |
| ✅ | **TI01B** | Same pattern, same branch, the **Part Sale Report** this time — every September upload (3/8/9/10 Sep, all literally `PartSaleReport-TI01B.xlsx`) is also a cumulative month-to-date export. Verified: every Bill No in 3 Sep is in 8 Sep; every one in 8 Sep is in 9 Sep; every one in 9 Sep is in 10 Sep (226→474→536→602 distinct bills, strict supersets). Branch confirmed Engine Flush should read 21 (today = MTD), not the summed 69. | Deleted the superseded 3/8/9 Sep `part_sale` snapshots + 4,096 raw rows, leaving 10 Sep as the sole holder (`scripts/fix-ti01b-sep-part-sale-cumulative.mjs --commit`). | Engine Flush MTD 69 → **21** (matches branch); Injector Cleaner 137 → **47**; Synthetic Oil 835.8 → **337.3** Ltrs; Brake Cleaning Spray 374 → **120**; External Sales ₹18,532.80 → **₹7,496**. |
| ✅ | **TI01B** | 3rd occurrence, the **Cost and Sales Report - GS** (SSRV089) — the one that actually feeds GUS Parts/Labour MTD. Same cumulative-reupload pattern (102→188→215→242 distinct job orders, strict supersets, identical to service_info's since both use the same `GSJ...` numbering); 9 Sep and 10 Sep are byte-identical (same filename, same totals) — the branch re-uploaded yesterday's file again. Caught via the user's own before/after tracking sheet: our buggy summed accessories deduction (₹3,45,472 parts / ₹46,498 labour) reproduced their "New" GUS Parts/Labour MTD exactly (₹13,18,133 / ₹10,34,316). | Deleted the superseded 3/8/9 Sep `ssrv089` (general) snapshots + 937 raw rows, leaving 10 Sep as the sole holder (`scripts/fix-ti01b-sep-ssrv089-cumulative.mjs --commit`). | Accessories deduction MTD: parts ₹3,45,472 → **₹1,35,749**, labour ₹46,498 → **₹17,821**. GUS Parts MTD ₹13,18,133 → **₹15,27,856**; GUS Labour MTD ₹10,34,316 → **₹10,62,994** — lands close to the branch's own "yesterday" figure (₹15,21,410 / ₹10,63,995), confirming TI01B's real MTD barely moved and the ₹2 L+ "drop" the tracking sheet flagged was purely the re-upload artifact. |
| ✅ | **KY01A** | Found 2026-09-12 via a full-company recount audit: two consecutive **Service Information Report - GS** uploads were byte-identical (same filename `Service_Info_Report-GS.csv`, same 121 rows, WB=5/WA=10/BS=1/EC=7/VAS=₹46,982 both times) — the branch resent the previous round's file instead of a fresh export, so that day's data summed twice into MTD. Only Service Info was affected; Part Sale/SSRV089/scom205/BA Tool for the same rounds were each genuinely distinct. | Deleted the resent snapshot + 121 raw rows, keeping the earlier (real) upload as sole holder (`scripts/fix-ky01a-sep09-service-info-dupe.mjs --commit`). Note: KY01A's date assignment for this whole span shifted by +1 day (unrelated correction) between the bug being found and the fix being applied — the script verifies upload content, not just the date label, before deleting. KY01A owes a fresh file for the round it resent. | Wheel Balancing MTD 73 → **68**; Wheel Alignment 96 → **86**; Brake Skimming 10 → **9**; Evaporator Cleaning 49 → **42**; VAS Bill revenue MTD ₹3,93,543 → **₹3,46,561**. |
| ✅ | **IR01A** | Found 2026-09-21 investigating a Revenue Stream reconciliation diff (dashboard vs vendor External Sales, 20 Sep): IR01A's "17 Sep" **Part Sale Report** (`SPRT014_PartSaleReport-17 SEP 2026_1.csv`, 101 rows) wasn't really 17 Sep data — every row carries `SaleDate` 18/09/2026 and is byte-identical (BillNo, PartNo, NetAmnt, Sale Qty, VinNo) to a row already in the real "18 Sep" file (321 rows). A mislabeled partial early pull of the 18th's business day, not a genuine 17th upload. Slipped past both existing duplicate checks: the whole-file exact-hash check (the files weren't identical — 18th had 220 more rows) and the "already uploaded today" guard (different claimed dates) — neither catches a *partial* resend filed under a different date. | Deleted the 17 Sep `part_sale` snapshot + 101 raw rows (`scripts/fix-ir01a-sep17-part-sale-duplicate.mjs --commit`), reverting IR01A to "not yet uploaded" for the 17th (genuinely true — none of that data was ever the 17th's); 18 Sep's snapshot remains the sole, correct holder. Also added a standing **bill-number overlap check** (`part-sale/upload-validation.ts`) to both the branch's own Part Sale upload route and the HQ Upload Sheet fallback — warns when ≥50% of a new file's bills were already uploaded this month, catching this class of partial-pull mislabel going forward (the fallback route had no duplicate check of any kind before this). | Removes IR01A's phantom double-counted 17 Sep contribution from External Sales MTD — exact ₹ delta not separately quantified before the snapshot was deleted. |

**TI01B is now confirmed to re-upload a cumulative month-to-date file for *all three* of its daily report types** (Service Info, Part Sale, SSRV089-GS) rather than a single day each round — worth a direct word to the branch, since every upload round will need re-fixing the same way until they switch to single-day exports.

---

## Resolved · Part Sale — External Sales filter

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **all except CO01B** | The External Sales filter matched a literal `BillNo` prefix `"AA"`. A BillNo is `[type][branch-letter]…` — `A` = external for every branch, but the branch letter varies (`AL` IR01A, `AF` KL01A, `AD` TI01A, …), so only CO01B's `AA` ever matched. Every other branch's external part sales scored ₹0. | Parser now matches first letter `A` = external, any branch; `C`/`I`/`D`/`E` types don't count (confirmed 2026-09-08). All 28 changed September part_sale snapshots re-derived from raw rows (`scripts/backfill-part-sale-external.mts`). | Adds the Part Sale side of External Sales for ~13 branches — e.g. PH01A +₹19 K, TR01C +₹23 K, TI01A +₹8 K MTD so far. Feeds "External Sales MTD" and "% on SPR I". |
| ✅ not a bug | **all branches** | KT01A flagged 2026-09-11: its External Sales MTD (₹5,973) looked too low against ₹6.41 L of "A"-type-bill (external) part sales on file. Root cause: on top of the bill-type filter, `parse.ts` also requires the PartNo prefix to be `D`/`L`/`Z`/`B`/`T` (+ a short exact list) — genuine Toyota parts (PartNo prefix `A-`: panels, headlamps, brake pads, A/C compressors…) sold on the same external bills don't match, so they're excluded. Same shape at every branch — company-wide MTD: ~₹2.19 L counted vs **~₹58.7 L in `A-`-prefix parts excluded** (biggest: TR01C ₹11.8 L, TR01A ₹9.3 L, KT01A ₹6.4 L, PH01A ₹5.5 L). | **No fix — confirmed intentional 2026-09-11.** External Sales here is meant to stay scoped to lubricants/DIY/consumables/spray; genuine spare-parts counter sales are tracked elsewhere (presumably BA Tool's own SPR External) and adding them here would double-count. | None — figures unchanged. Documented so this doesn't get "rediscovered" as a bug later. |

## Resolved · scom205 parser

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **TR01B** | Export changed format ~3 Sep (`.xls` → `.xlsx`) and stopped filling the "Total" column group — parser read blanks, saved 0. Only TR01B affected. | Parser now falls back to the branch-specific column group when Total is blank (a single-branch export's branch total *is* the total). Snapshots 3/4/7 Sep re-derived from raw rows 2026-09-08 (`scripts/backfill-scom205.mjs`). | BPU Parts MTD 0 → **₹9.01 L**, BPU Labour MTD 0 → **₹3.72 L** as of 7 Sep |

## Resolved · service_info parser — Brake Skimming scope

| ✅ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ✅ | **9 branches** | Brake Skimming only matched `FR DISC (ONE SIDE) (ON-VEHICLE) - GRIND` / its opp-side combo — missed rear-axle disc grinds and every **off-vehicle** (bench-lathe) grind. Same skimming service, just a different Job Desc. | `isBrakeSkimmingDesc()` now matches the shape `(FR\|RR) DISC (ONE SIDE) ((ON\|OFF)-VEHICLE) … GRIND` (still per repair order, confirmed 2026-09-09). All Sept snapshots re-derived from raw rows (`scripts/recompute-service-info-brake-skimming.mts`). | Group MTD **54 → 76**. CO01A +7, MV01A +3, TR01C +3, CO01B +2, TI01A +2, TI01C +2, IR01A/TL01A/TR01A +1. KL01A, KT01A/B, KY01A, PH01A, TI01B unchanged. Display count only — no revenue effect. |

## Open · CO01A Wheel Balancing/Alignment/Evaporator Cleaning still off vs the branch's own count

After the Sept 7 Service Info-GS fix above, the branch team's own manual tally for September still runs
**+1 Wheel Balancing, +2 Wheel Alignment, +2 Evaporator Cleaning** below what the dashboard now shows —
Brake Skimming and VAS Revenue matched exactly. Checked for the obvious causes (2026-09-12): no duplicate
rows in the file, no GS/BP overlap, no cancelled jobs, no ambiguous job-code-to-description collisions.
One suspicious row found — Job Order `GSJ2613730` (Wheel Alignment), Reg No is the literal placeholder
`"REGNO"`, closed by CO01A's own Accessories staffer (Aneesh E K) — but that only accounts for 1 of the 2
Wheel Alignment excess, and none of Wheel Balancing/Evaporator Cleaning. Waiting on the branch's own list
of Job Order/invoice numbers to diff directly against.

---

## Related open items · Part Sale

Same clean-up effort, different report — carried here so they don't get lost.

| ☐ | Branch | Problem | Fix | Impact |
|---|--------|---------|-----|--------|
| ☐ | **CO01B** | `Sale Report 01–28 Aug` cumulative counted on both 27 & 28 Aug | Delete the 27 Aug `part_sale` snapshot (28 Aug already covers the span) | External Sales (parts side) overstated ≈ ₹1.02 L for August |
| ☐ | _multiple_ | 10 CSV upload-days (late Aug / early Sep) have quote-shifted rows. Parser fixed forward (commit `ff53a91`); history not recoverable without re-upload | Re-upload those days if their other metrics matter | minor · isolated rows · no material External Sales effect |
