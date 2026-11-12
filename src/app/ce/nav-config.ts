export type CeSection = "leads" | "avf" | "mrs" | "conquest" | "reports" | "archive";

// Plain data, deliberately kept out of sidebar-shell.tsx ("use client"):
// a Server Component importing a value export from a client module gets an
// opaque client reference back, not the real array (see ce-shell.tsx's HQ
// branch, which reads this directly — broke that way in 8b4a71c).
export const sections = [
  { key: "leads", href: "/ce", label: "Leads overview", description: "Call queue and follow-ups" },
  { key: "avf", href: "/ce/avf", label: "AVF analytics", description: "Mileage frequency bands" },
  { key: "mrs", href: "/ce/mrs", label: "MRS catch list", description: "Due, missed by TKM's N-9" },
  { key: "conquest", href: "/ce/conquest", label: "Conquest leads", description: "Never serviced — cold outreach" },
  { key: "reports", href: "/ce/reports", label: "Call performance", description: "Daily connected/appointment rates" },
] as const;
