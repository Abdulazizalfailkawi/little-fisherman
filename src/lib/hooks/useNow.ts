"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendering every `ms` (default 1 s) — drives live countdowns. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    const vis = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [ms]);
  return now;
}
