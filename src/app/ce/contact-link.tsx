export function ContactLink({ value, className = "" }: { value: string | null; className?: string }) {
  return value ? <a href={`tel:${value}`} className={`whitespace-nowrap text-accent-text underline underline-offset-2 ${className}`}>{value}</a> : <span className={className}>Number unavailable</span>;
}
