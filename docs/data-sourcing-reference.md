# Data sourcing reference

Where every figure on the dashboard actually comes from — source report, exact column(s), matching rule, and how "today" vs "MTD" is computed. Written 2026-09-11 against the current codebase; if a formula changes, update this alongside it (same spirit as `data-reconciliation.md`, but this file describes *how things work*, not *what's been fixed*).

## The six raw reports, per branch per day

| Report | Upload label | Parsed into | Who skips it |
|---|---|---|---|
| BA Tool | *(HQ uploads once, company-wide)* | `ba_tool_snapshots` | — one file covers every branch |
| Service Info Report – GS | "Service Info Report" | `service_info_snapshots` | Body & Paint-only branches (CO01E/KL01B/TR01B) |
| Service Info Report – BP | "Service Information Report - BP" | `service_info_bp_snapshots` (4 of 5 metrics only — see below) | nobody; required from everyone |
| Cost and Sales Report – GS (SSRV089) | "Cost and Sales Report - GS" | `ssrv089_snapshots` (variant `general`) | Body & Paint-only branches |
| Cost and Sales Report – BP (SSRV089) | "Cost and Sales Report - BP" | **not parsed** — raw bytes only, `raw_report_uploads` | nobody; required from everyone |
| Part Sale Report | "Part Sale Report" | `part_sale_snapshots` | nobody |
| scom205 Monthly KPI Report | "KPI" | `scom205_snapshots` | nobody |

Every parsed report also keeps **every column of every row**, exactly as uploaded, in `raw_upload_rows` (keyed by report type/date/branch/row index) — so a new metric or a correction can be re-derived later without needing the original file back.

## Two accumulation patterns — this is the thing to get right

- **Cumulative-in-source** (scom205, and BA Tool's own MTD-style fields): the uploaded file already contains the whole month's running total. We take **only the latest upload's value** — never sum across days. Summing these is the recurring bug this session kept finding (IR01A, CO01B, TI01B ×3) whenever a branch re-uploads a "month so far" export instead of a single day.
- **Per-day, summed** (Service Info's 4 counts + VAS revenue, Part Sale's 6 fields, SSRV089's 2 accessories fields): each upload is meant to be one calendar day's activity, and MTD = **sum of every day's snapshot this month**. This only works if every upload really is a single day — the same recurring bug above happens when a branch uploads a cumulative file into this pattern instead.

## Metric-by-metric

### From the BA Tool file (one company-wide upload, MTD-cumulative-in-source)

| Field | Column | Today | MTD |
|---|---|---|---|
| PM (OC) | `PM` | this upload minus previous upload's `PM` | `PM`, read straight |
| BPUS | `BPUS` | delta vs previous upload | read straight |
| SPR Internal (Parts Retail) | `SPR Internal` | delta vs previous upload | read straight |
| SPR External | `SPR External` | — | read straight, **then added to** Part Sale's own External Sales (see below) |
| SPO Dealer (Offtake) | `SPO Dealer` | delta vs previous upload | read straight |
| SPO T-Gloss | `SPO T-Gloss` | — | read straight; ÷ `SPO T-Gloss Target` = "T-Gloss SPO" ratio |
| CPUS | `CPUS` | delta vs previous upload | read straight |
| GUS (RO count) | `GUS` | delta vs previous upload | read straight — this is the RO count VAS Bill Target and "VAS Gentani" divide by |
| Tyre | `Tyre Actual` / `Tyre Target` | delta vs previous | read straight |
| Battery | `Battery Actuals` / `Battery Target` | delta vs previous | read straight |
| Service Penetration | `Service Penetration` | — | read straight, no target |

"Delta vs previous upload" = today's value minus whatever the *previous* BA Tool snapshot held for that field (not necessarily yesterday — if a day was skipped, it's the last one actually uploaded). First-ever upload has no previous to diff against, so "today" falls back to the raw MTD figure.

**CO01C (online store)** isn't a real branch on the dashboard — its `SPR External`, `SPO Dealer`, and `SPO Dealer Target` get added straight into CO01A's own row before anything else runs; every other CO01C field is ignored. **CO01D** is excluded entirely (a Lexus code this dashboard doesn't track).

### From the Service Info Report (GS + BP combined for 4 of 5; BP parsing added 2026-09-11)

Same match rules run against both the GS and BP file — `service-info/parse.ts`'s `parseServiceInfoWorkbook` doesn't know or care which one it's reading.

| Metric | Match rule (on `Job Desc`, whitespace-normalized) | Counted as | GS+BP? |
|---|---|---|---|
| Wheel Balancing | exactly `"WB (OFF-VEHICLE, TWO WHEELS) - ADJST"` | 1 per matching row | ✅ |
| Wheel Alignment | exactly `"WHEEL ALIGNMENT - INSP"` | 1 per matching row | ✅ |
| Brake Skimming | regex `(FR|RR) DISC (ONE SIDE) (ON|OFF-VEHICLE) … GRIND` — any axle, on/off vehicle, ~8 DMS spelling variants | 1 per **distinct Job Order No** among matching rows (not per line) | ✅ |
| Evaporator Cleaning | exactly `"TGLOSS Air Fresh-Front Evaporator"` — front only, rear/combined/R&R excluded | 1 per matching row | ❌ **GS only** |
| VAS Bill revenue | `Job Code` matches a T-Gloss/Lexus treatment (`vas-price-list.ts`) | see pricing below | ✅ |

VAS revenue pricing, per matching row: look up the treatment by exact `Job Code`; if it's one of the 9 Lexus-only treatments (price list has only an "Ex. Large" price), price there regardless of `Series`; otherwise map `Series` → a size class (`vas-series-map.ts`) and price at that size, **at the uploading branch's city tier** (A or B, `branch-tier.ts`). No match on job code, no size mapping, or no tier on file → contributes ₹0, never a guessed price. **Excludes** any row whose `Close Service Advisor Name` is on that branch's Accessories roster (`/data`) — those sales are counted through SSRV089 instead, not double-counted here.

"Today" for all 5 = that day's snapshot's count, straight. MTD = sum across every snapshot this month (GS `service_info_snapshots` + BP `service_info_bp_snapshots`, merged at read time in `service-info/store.ts`'s `loadCombinedServiceInfoSnapshots*` — the plain GS-only loaders back the upload-lock checks and pending-uploads list, which must never see BP-inflated numbers).

### From the Part Sale Report (GS only — no BP equivalent exists for this report)

| Metric | Match rule (on `PartNo`) | Unit |
|---|---|---|
| Engine Flush | `PartNo` in `["A-08814-80061", "A-08814-80090"]` | count of `Sale Qty` |
| Injector Cleaner | `PartNo` in `["A-08813-80100", "A-08813-80019"]` | count of `Sale Qty` |
| Synthetic Oil | `PartNo` in the 7-SKU oil list | `Sale Qty` ÷ 10 = litres (DMS records tenths of a litre) |
| Brake Cleaning Spray | `PartNo = "Z-9BCHP-00001"` | count of `Sale Qty` |
| DIY (informational only) | `PartNo` starts with `"D-DIY"` | count = `Sale Qty`; revenue = `NetAmnt` |
| External Sales (Part Sale side) | `BillNo` starts with `A` (external-type bill, any branch — the branch letter that follows varies) **and** `PartNo` starts with `D`/`L`/`Z`/`B`/`T`, or is one of 13 exact SKUs (ADBLUE + 12 DIY detailing consumables) | sum of `NetAmnt` |

**Deliberately excluded from External Sales:** genuine Toyota parts (`PartNo` prefix `A-` — panels, headlamps, brake pads, compressors, etc.) sold on the same external bills — confirmed by design 2026-09-11, not a bug (see `data-reconciliation.md`). Negative `Sale Qty` rows (returns/credit notes) net against the day's total, they're not excluded.

MTD = sum across every day's snapshot this month.

### From the Cost and Sales Report – GS (SSRV089) — the Accessories deduction

One filter only: sum `Part Sale` / `Labour Sale` for rows where `Close SA Name` matches a name on that branch's Accessories roster (`/data`, exact after whitespace/case normalization). This is the deduction that turns raw GUS revenue into "real" GUS Parts/Labour (see below) — it's a General Service report, tracking which of the branch's own accessories-department staff closed a job that day; a `Close SA Name` mismatch (a name variant the roster doesn't have) means that person's sales are never deducted, overstating GUS revenue. MTD = sum across every day's snapshot this month. Cost and Sales Report – BP is uploaded and locked the same way but **never parsed** — no Accessories concept applies to Body & Paint jobs.

### From the scom205 Monthly KPI Report

Two pre-totaled rows, read straight off the **latest** upload only (never summed — the file is already cumulative):
- `"Total General Units Serviced"` row → GUS SP Rev / GUS Lab Rev
- `"Total Body & Paint Units Serviced"` row → BPU SP Rev / BPU Lab Rev

(Column position varies by branch's export format — located from a sub-header row each time, "Total" group preferred, branch-specific group as fallback.)

### Bills (PDF tax invoices — scrap / used oil)

Not tied to any of the six daily reports. HQ or a branch uploads a PDF; invoice number + taxable value are extracted automatically; the uploader tags it `scrap` or `used_oil` (or leaves it untagged). Summed by branch, **by upload timestamp** — not invoice date — so a month's figure can still move after the month "closes" as more bills trickle in. Always 0 when a branch has none (never null).

## The derived figures (computed in `report.ts`, nothing pulled straight from a file)

| Figure | Formula |
|---|---|
| **GUS Parts MTD** | scom205's GUS SP Rev MTD (latest) − SSRV089 Accessories Part Sale MTD (summed). **0** for Body & Paint-only branches (no general service desk at all, not "unknown"). |
| **GUS Labour MTD** | scom205's GUS Lab Rev MTD (latest) − SSRV089 Accessories Labour Sale MTD (summed). Same 0-for-BP-only rule. |
| **BPU Parts / Labour MTD** | scom205's BPU SP/Lab Rev MTD (latest), straight — no deduction. |
| **External Sales MTD** | BA Tool's `SPR External` (latest, already cumulative) **+** Part Sale Report's External Sales (summed across the month). For Body & Paint-only branches, the Part Sale component defaults to 0 rather than staying null. |
| **Total Revenue Stream MTD** | GUS Parts + GUS Labour + BPU Parts + BPU Labour + External Sales + Scrap revenue + Used Oil revenue. Null unless every one of the five BA-Tool-derived inputs is present (bills are always 0-or-real, never block it). |
| **% on SPR I** | External Sales MTD ÷ (SPR Internal MTD + External Sales MTD). |
| **VAS Bill Target** | GUS RO MTD (the `GUS` field) × 38% × ₹3,000 — fixed constants, every branch and tier. |
| **VAS Achievement %** | VAS Bill revenue MTD ÷ VAS Bill Target. |
| **VAS Gentani** | VAS Bill revenue MTD ÷ GUS RO MTD — average VAS revenue per GUS repair order (the user's own term for this ratio; not target-graded). |
| **T-Gloss SPO** | `SPO T-Gloss` ÷ `SPO T-Gloss Target`. |

## Branch-level special cases

- **Body & Paint-only** (`CO01E`, `KL01B`, `TR01B`, `isBodyPaintOnly()` in `report.ts`): no GS-variant Service Info / SSRV089 uploads at all (the `/upload` page hides those two forms for them). GUS Parts/Labour MTD is forced to `0`; Total Revenue Stream = BPU Parts + BPU Labour + SPR External + scrap + used oil.
- **CO01C** (online store): not a branch on any dashboard view — its `SPR External`/`SPO Dealer`/`SPO Dealer Target` merge into CO01A before anything else computes; every other field of its row is ignored.
- **CO01D**: excluded entirely, everywhere.
- **City tier** (`branch-tier.ts`, A or B per branch) only matters for one thing: which retail price VAS Bill revenue matches against.
- **Accessories roster** (`/data`, per branch) only matters for two things: the SSRV089 deduction that produces real GUS Parts/Labour, and excluding those same staff's rows from VAS Bill revenue (so their accessories sales aren't counted twice).
