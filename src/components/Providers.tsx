"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { evaluateAchievements } from "@/lib/achievements";
import { StoreProvider, useStore } from "@/lib/db/store";
import { I18nProvider } from "@/lib/i18n";
import { tripRows } from "@/lib/stats";
import { BottomNav } from "./BottomNav";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <StoreProvider>
        <Shell>{children}</Shell>
      </StoreProvider>
    </I18nProvider>
  );
}

const PUBLIC = ["/login"];

function Shell({ children }: { children: React.ReactNode }) {
  const { ready, mode } = useStore();
  const path = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC.includes(path);

  useEffect(() => {
    if (ready && !mode && !isPublic) router.replace("/login");
  }, [ready, mode, isPublic, router]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          // Refresh the offline copy of every page at most every 6 hours.
          const KEY = "ft.swWarm";
          let last = 0;
          try {
            last = Number(localStorage.getItem(KEY) ?? 0);
          } catch {}
          if (navigator.onLine && Date.now() - last > 6 * 3600_000) {
            const reg = await navigator.serviceWorker.ready;
            reg.active?.postMessage("warm");
            try {
              localStorage.setItem(KEY, String(Date.now()));
            } catch {}
          }
        })
        .catch(() => undefined);
    }
  }, []);

  if (!ready || (!mode && !isPublic)) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="text-5xl">🎣</div>
          <div className="text-sm">…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(var(--safe-bottom)+6.5rem)]">{children}</main>
      {mode && !isPublic && (
        <>
          <BottomNav />
          <AchievementRecorder />
        </>
      )}
    </>
  );
}

/** Persists first-unlock dates of achievements derived from the records. */
function AchievementRecorder() {
  const { ds, idx, save } = useStore();
  const rows = useMemo(() => tripRows(ds, idx), [ds, idx]);
  const busy = useRef(false);
  useEffect(() => {
    if (busy.current) return;
    const known = new Set(ds.user_achievements.map((a) => a.achievement_code));
    const fresh = evaluateAchievements(ds, idx, rows).filter((s) => s.unlocked && s.unlockedAt && !known.has(s.def.code));
    if (!fresh.length) return;
    busy.current = true;
    const t = setTimeout(() => {
      void save(
        "user_achievements",
        fresh.map((s) => ({
          achievement_code: s.def.code,
          unlocked_at: s.unlockedAt!,
          context: null,
          created_at: new Date().toISOString(),
        })),
      ).finally(() => (busy.current = false));
    }, 1500);
    return () => {
      clearTimeout(t);
      busy.current = false;
    };
  }, [ds, idx, rows, save]);
  return null;
}
