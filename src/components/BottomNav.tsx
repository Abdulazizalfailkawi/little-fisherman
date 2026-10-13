"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Sailboat, Waves } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "./ui";

/** Routes that belong to each of the three primary sections. */
export const SECTION_ROUTES = {
  sea: ["/marine"],
  trips: ["/trips", "/trip", "/catch", "/catches", "/calendar", "/spots", "/spot", "/equipment", "/gallery", "/search", "/quick"],
  stats: ["/stats", "/analytics", "/collection", "/species", "/records", "/achievements", "/reports", "/report", "/settings", "/more"],
};

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const items = [
    { href: "/", icon: Waves, label: t("البحر", "Sea"), match: (p: string) => p === "/" || SECTION_ROUTES.sea.some((x) => p.startsWith(x)) },
    { href: "/trips", icon: Sailboat, label: t("رحلاتي وصيدي", "Trips & catches"), match: (p: string) => SECTION_ROUTES.trips.some((x) => p.startsWith(x)) },
    { href: "/stats", icon: BarChart3, label: t("إحصائياتي", "My stats"), match: (p: string) => SECTION_ROUTES.stats.some((x) => p.startsWith(x)) },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line/50 bg-navy/90 pb-[var(--safe-bottom)] backdrop-blur-xl">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2">
        {items.map((it) => {
          const on = it.match(path);
          const Icon = it.icon;
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", on ? "text-teal" : "text-muted")}>
                <span className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors", on && "bg-teal/15")}>
                  <Icon className="size-6" />
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
