// CE's dialer setup can't place calls from the +91 international format,
// so the number shown/dialed is rewritten to the 0-prefixed local form —
// stored value is untouched, this is display/dial-only.
function dialable(value: string): string {
  return value.startsWith("+91") ? `0${value.slice(3)}` : value;
}

export function ContactLink({ value, className = "" }: { value: string | null; className?: string }) {
  if (!value) return <span className={className}>Number unavailable</span>;
  const display = dialable(value);
  return <a href={`tel:${display}`} className={`whitespace-nowrap text-accent-text underline underline-offset-2 ${className}`}>{display}</a>;
}
