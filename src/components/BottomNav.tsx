"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Plus, Sailboat, Waves } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "./ui";

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const items = [
    { href: "/", icon: Home, label: t("الرئيسية", "Home"), match: (p: string) => p === "/" },
    { href: "/trips", icon: Sailboat, label: t("الرحلات", "Trips"), match: (p: string) => p.startsWith("/trip") },
    { href: "/quick", icon: Plus, label: t("تسجيل", "Log"), primary: true, match: () => false },
    { href: "/marine", icon: Waves, label: t("البحر", "Marine"), match: (p: string) => p.startsWith("/marine") },
    { href: "/more", icon: LayoutGrid, label: t("المزيد", "More"), match: (p: string) => ["/more", "/stats", "/calendar", "/records", "/achievements", "/equipment", "/settings", "/search", "/gallery", "/spots", "/spot", "/report", "/reports", "/catches", "/collection", "/species"].some((x) => p.startsWith(x)) },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line/50 bg-navy/90 pb-[var(--safe-bottom)] backdrop-blur-xl">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2">
        {items.map((it) => {
          const on = it.match(path);
          const Icon = it.icon;
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", on ? "text-teal" : "text-muted")}
              >
                {it.primary ? (
                  <span className="-mt-6 grid size-14 place-items-center rounded-2xl bg-teal text-abyss shadow-lg shadow-teal/30">
                    <Icon className="size-7" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon className="size-6" />
                )}
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
