"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nextIndiaMidnight } from "@/lib/ce/rules";

export function MidnightRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.refresh(), Math.max(0, nextIndiaMidnight() - Date.now()) + 1_000);
    return () => window.clearTimeout(timer);
  }, [router]);
  return null;
}
