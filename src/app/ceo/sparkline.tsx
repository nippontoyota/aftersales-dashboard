/** Tiny inline trend line for a hero tile — month-so-far shape, not a chart
 * meant to be read precisely (no axes/labels). Null points are skipped. */
export function Sparkline({ points, className = "" }: { points: (number | null)[]; className?: string }) {
  const values = points.filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords: [number, number][] = [];
  points.forEach((v, i) => {
    if (v === null) return;
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    coords.push([x, y]);
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`h-7 w-full ${className}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  );
}
