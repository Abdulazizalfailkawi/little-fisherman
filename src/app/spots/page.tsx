"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { LocationForm } from "@/components/pickers";
import { Badge, Button, Card, Empty, N, PageHeader, Sheet } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { byLocation, pct, tripRows } from "@/lib/stats";
import type { Location } from "@/lib/types";

export default function SpotsPage() {
  const { ds, idx, remove } = useStore();
  const { t, num, lang } = useI18n();
  const [edit, setEdit] = useState<Location | "new" | null>(null);
  const stats = useMemo(() => new Map(byLocation(tripRows(ds, idx)).groups.map((g) => [g.key, g])), [ds, idx]);

  return (
    <>
      <PageHeader section="trips"
        title={t("مواقع الصيد", "Fishing spots")}
        actions={
          <Button size="sm" onClick={() => setEdit("new")} aria-label="add">
            <Plus className="size-5" />
          </Button>
        }
      />
      {ds.locations.length === 0 ? (
        <Empty icon="📍" title={t("لا توجد مواقع", "No spots yet")} />
      ) : (
        <div className="space-y-2">
          {[...ds.locations]
            .sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite) || (stats.get(b.id)?.trips ?? 0) - (stats.get(a.id)?.trips ?? 0))
            .map((l) => {
              const s = stats.get(l.id);
              return (
                <Link key={l.id} className="block w-full text-start" href={`/spot?id=${l.id}`}>
                  <Card className="flex items-center gap-3 hover:bg-surface-2">
                    <div className="grid size-12 place-items-center rounded-xl bg-surface-2">
                      <MapPin className="size-6 text-teal" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold">
                        {l.is_favorite && <span className="text-warn">★</span>}
                        {lang === "ar" ? l.name : l.name_en || l.name} {l.is_demo && <Badge tone="ocean">{t("تجريبي", "Demo")}</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        {l.area ?? ""} {l.lat == null && <span className="text-warn">· {t("بدون إحداثيات", "no coordinates")}</span>}
                      </div>
                      {s && (
                        <div className="text-xs text-ink-2">
                          {s.catches} {t("سمكة", "fish")} · {num(s.catchesPerTrip, 2)} {t("لكل رحلة", "per trip")} · {pct(s.successRate)} <N n={s.trips} />
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
        </div>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? t("موقع جديد", "New spot") : t("تعديل الموقع", "Edit spot")}>
        {edit && (
          <>
            <LocationForm initial={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />
            {edit !== "new" && (
              <Button
                variant="danger"
                className="mt-3 w-full"
                onClick={async () => {
                  if (!confirm(t("حذف الموقع؟ الرحلات تبقى بدون موقع.", "Delete spot? Trips stay, without a spot."))) return;
                  await remove("locations", edit);
                  setEdit(null);
                }}
              >
                <Trash2 className="size-4" /> {t("حذف الموقع", "Delete spot")}
              </Button>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
