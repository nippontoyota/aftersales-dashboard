import { DateSelect } from "@/app/dashboard/date-select";

/**
 * Shown when a picked date has no BA Tool report on file — distinct from "no
 * data has ever been uploaded" (that case has nothing to navigate to, so it
 * keeps its own simpler message per-page). This one keeps the date control
 * live so the user isn't stranded on an empty date; branches are backfilling
 * data from January onward, so an empty date is an expected, temporary state
 * rather than an error.
 */
export function NoDataForDate({
  title,
  date,
  dates,
  basePath,
  extraParams,
  message,
  wrapperClassName = "mx-auto max-w-[1600px] p-6",
}: {
  title: string;
  date: string;
  dates: string[];
  basePath: string;
  extraParams?: Record<string, string>;
  message?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={wrapperClassName}>
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        <DateSelect dates={dates} selected={date} region="All" basePath={basePath} extraParams={extraParams} />
      </div>
      <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
        {message ?? `No BA Tool report on file for ${date}.`}
      </div>
    </div>
  );
}
