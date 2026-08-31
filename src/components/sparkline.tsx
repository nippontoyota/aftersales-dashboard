const WIDTH = 100;
const HEIGHT = 28;

/** A bare trend line, no axes/labels/tooltip — for embedding inside a KPI card where the big trend chart elsewhere already carries the full detail. Null points are skipped, not zeroed, so a metric that hasn't been uploaded every day doesn't show a misleading dip to zero. */
export function Sparkline({ values, color = "#dc2626" }: { values: (number | null)[]; color?: string }) {
  const points = values.filter((v): v is number => v !== null);
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  let path = "";
  let started = false;
  let i = 0;
  for (const v of values) {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * WIDTH;
    if (v !== null) {
      const y = HEIGHT - ((v - min) / range) * HEIGHT;
      path += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      started = true;
    }
    i += 1;
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={path.trim()} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
