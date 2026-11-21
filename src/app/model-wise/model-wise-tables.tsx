import { Fragment } from "react";
import { branchName } from "@/lib/branch-names";
import { formatCompactCurrency, formatCompact } from "@/lib/format";
import { VEHICLE_BRANDS, type VehicleBrand } from "@/lib/model-wise/brand";

const BRAND_LABEL: Record<VehicleBrand, string> = { toyota: "Toyota", alliance: "Alliance", lexus: "Lexus" };

function perCar(amount: number, ros: number): number | null {
  return ros > 0 ? amount / ros : null;
}

export type PartsLabourRow = {
  branch: string;
  byBrand: Record<VehicleBrand, { ros: number; parts: number; labour: number }>;
};

/** Branch-wise table for one section (Combined / GUS / BP) — Toyota /
 * Alliance / Lexus column groups, each ROs · Parts (Cr) · Labour (Cr) ·
 * Parts/car · Labour/car — same shape as the user's own Branch-wise GUS/BP
 * Excel sheets, branches as rows instead of their side-by-side brand blocks
 * transposed into one sticky-header table. */
export function PartsLabourBrandTable({ title, rows, total }: { title: string; rows: PartsLabourRow[]; total: PartsLabourRow["byBrand"] }) {
  return (
    <div className="overflow-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint"
            >
              {title}
            </th>
            {VEHICLE_BRANDS.map((brand) => (
              <th
                key={brand}
                colSpan={5}
                className="sticky top-0 z-20 border-b border-l-2 border-border-strong bg-surface-2/70 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
              >
                {BRAND_LABEL[brand]}
              </th>
            ))}
          </tr>
          <tr>
            {VEHICLE_BRANDS.map((brand) => (
              <Fragment key={brand}>
                <th className="sticky top-[29px] z-20 border-b border-l-2 border-border-strong bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  ROs
                </th>
                <th className="sticky top-[29px] z-20 border-b border-border bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Parts
                </th>
                <th className="sticky top-[29px] z-20 border-b border-border bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Labour
                </th>
                <th className="sticky top-[29px] z-20 border-b border-border bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Parts/car
                </th>
                <th className="sticky top-[29px] z-20 border-b border-border bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Labour/car
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branch} className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-surface py-1.5 pl-4 pr-3 text-fg-muted">
                <span className="font-medium text-fg">{row.branch}</span>
                <span className="ml-1.5 text-fg-faint">— {branchName(row.branch)}</span>
              </td>
              {VEHICLE_BRANDS.map((brand) => {
                const f = row.byBrand[brand];
                return (
                  <Fragment key={brand}>
                    <td className="whitespace-nowrap border-l-2 border-border-strong px-2 py-1.5 text-right tabular-nums text-fg">
                      {formatCompact(f.ros)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg">
                      {formatCompactCurrency(f.parts)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg">
                      {formatCompactCurrency(f.labour)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg-muted">
                      {formatCompactCurrency(perCar(f.parts, f.ros))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg-muted">
                      {formatCompactCurrency(perCar(f.labour, f.ros))}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-border bg-accent-soft/50 font-semibold">
            <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-accent-soft/50 py-1.5 pl-4 pr-3 text-fg">Company Total</td>
            {VEHICLE_BRANDS.map((brand) => {
              const f = total[brand];
              return (
                <Fragment key={brand}>
                  <td className="whitespace-nowrap border-l-2 border-border-strong px-2 py-1.5 text-right tabular-nums">
                    {formatCompact(f.ros)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatCompactCurrency(f.parts)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatCompactCurrency(f.labour)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatCompactCurrency(perCar(f.parts, f.ros))}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatCompactCurrency(perCar(f.labour, f.ros))}
                  </td>
                </Fragment>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export type TglossRow = { branch: string; byBrand: Record<VehicleBrand, number> };

export function TglossBrandTable({ rows, total }: { rows: TglossRow[]; total: Record<VehicleBrand, number> }) {
  return (
    <div className="overflow-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
              Branch
            </th>
            {VEHICLE_BRANDS.map((brand) => (
              <th key={brand} className="sticky top-0 z-20 border-b border-l-2 border-border-strong bg-surface py-2 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                {BRAND_LABEL[brand]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branch} className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-surface py-1.5 pl-4 pr-3 text-fg-muted">
                <span className="font-medium text-fg">{row.branch}</span>
                <span className="ml-1.5 text-fg-faint">— {branchName(row.branch)}</span>
              </td>
              {VEHICLE_BRANDS.map((brand) => (
                <td key={brand} className="whitespace-nowrap border-l-2 border-border-strong px-3 py-1.5 text-right tabular-nums text-fg">
                  {formatCompactCurrency(row.byBrand[brand])}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border bg-accent-soft/50 font-semibold">
            <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-accent-soft/50 py-1.5 pl-4 pr-3 text-fg">Company Total</td>
            {VEHICLE_BRANDS.map((brand) => (
              <td key={brand} className="whitespace-nowrap border-l-2 border-border-strong px-3 py-1.5 text-right tabular-nums">
                {formatCompactCurrency(total[brand])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export type ItemFiguresLite = { count: number; revenue: number };
export type ItemRow = { branch: string; byBrand: Record<VehicleBrand, ItemFiguresLite> };

export function ItemBrandTable({ title, rows, total }: { title: string; rows: ItemRow[]; total: Record<VehicleBrand, ItemFiguresLite> }) {
  return (
    <div className="overflow-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full border-separate border-spacing-0 text-[12.5px]">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint"
            >
              {title}
            </th>
            {VEHICLE_BRANDS.map((brand) => (
              <th key={brand} colSpan={2} className="sticky top-0 z-20 border-b border-l-2 border-border-strong bg-surface-2/70 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                {BRAND_LABEL[brand]}
              </th>
            ))}
          </tr>
          <tr>
            {VEHICLE_BRANDS.map((brand) => (
              <Fragment key={brand}>
                <th className="sticky top-[29px] z-20 border-b border-l-2 border-border-strong bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Count
                </th>
                <th className="sticky top-[29px] z-20 border-b border-border bg-surface py-1.5 px-2 text-right text-[10.5px] font-medium text-fg-faint">
                  Revenue
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branch} className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-surface py-1.5 pl-4 pr-3 text-fg-muted">
                <span className="font-medium text-fg">{row.branch}</span>
                <span className="ml-1.5 text-fg-faint">— {branchName(row.branch)}</span>
              </td>
              {VEHICLE_BRANDS.map((brand) => {
                const f = row.byBrand[brand];
                return (
                  <Fragment key={brand}>
                    <td className="whitespace-nowrap border-l-2 border-border-strong px-2 py-1.5 text-right tabular-nums text-fg">
                      {formatCompact(f.count)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg">
                      {formatCompactCurrency(f.revenue)}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-border bg-accent-soft/50 font-semibold">
            <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border-subtle bg-accent-soft/50 py-1.5 pl-4 pr-3 text-fg">Company Total</td>
            {VEHICLE_BRANDS.map((brand) => {
              const f = total[brand];
              return (
                <Fragment key={brand}>
                  <td className="whitespace-nowrap border-l-2 border-border-strong px-2 py-1.5 text-right tabular-nums">
                    {formatCompact(f.count)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {formatCompactCurrency(f.revenue)}
                  </td>
                </Fragment>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
