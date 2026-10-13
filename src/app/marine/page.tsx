"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The marine dashboard is now the home screen ("البحر"). */
export default function MarineRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
