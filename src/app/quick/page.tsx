"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, Fish, PlayCircle } from "lucide-react";
import { DualDate } from "@/components/common";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { lastUsed, newTrip } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";

export default function QuickPage() {
  const { ds, idx, save } = useStore();
  const { t, name } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const drafts = ds.trips.filter((x) => x.status === "draft").sort((a, b) => b.started_at.localeCompare(a.started_at));
  const recent = ds.trips
    .filter((x) => x.status === "completed")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 5);

  const startNow = async (thenFish: boolean) => {
    setBusy(true);
    const trip = newTrip({ ...lastUsed(ds), status: "draft" });
    await save("trips", trip);
    router.replace(thenFish ? `/catch/edit?trip=${trip.id}` : `/trip?id=${trip.id}`);
  };

  return (
    <>
      <PageHeader title={t("تسجيل سريع", "Quick log")} back />
      <div className="space-y-3">
        {drafts.map((d) => (
          <Card key={d.id} className="border-teal/40">
            <div className="mb-3 text-sm">
              <div className="text-xs text-teal">{t("رحلة جارية", "Trip in progress")}</div>
              <div className="font-semibold">{d.title || (d.location_id && idx.locById.get(d.location_id)?.name) || t("رحلة صيد", "Fishing trip")}</div>
              <DualDate iso={d.started_at} className="text-xs text-muted" />
            </div>
            <Button variant="teal" size="lg" className="w-full" onClick={() => router.push(`/catch/edit?trip=${d.id}`)}>
              <Fish className="size-6" /> {t("سجّل سمكة في هذه الرحلة", "Log a fish on this trip")}
            </Button>
          </Card>
        ))}

        <Button size="lg" className="w-full" loading={busy} onClick={() => startNow(false)}>
          <PlayCircle className="size-6" /> {t("ابدأ رحلة الآن", "Start a trip now")}
        </Button>
        {drafts.length === 0 && (
          <Button size="lg" variant="teal" className="w-full" loading={busy} onClick={() => startNow(true)}>
            <Fish className="size-6" /> {t("ابدأ رحلة وسجّل سمكة", "Start trip & log a fish")}
          </Button>
        )}
        <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/trip/edit")}>
          <CalendarPlus className="size-6" /> {t("تسجيل رحلة سابقة", "Record a past trip")}
        </Button>
        <p className="px-1 text-xs leading-relaxed text-muted">
          {t(
            "«ابدأ رحلة الآن» يستخدم آخر موقع وطريقة استخدمتها. يمكنك تعديل كل شيء لاحقاً، ويعمل بدون إنترنت.",
            "“Start a trip now” reuses your last spot and technique. You can edit everything later, and it works offline.",
          )}
        </p>

        {recent.length > 0 && (
          <>
            <SectionTitle>{t("إضافة سمكة إلى رحلة سابقة", "Add a fish to a past trip")}</SectionTitle>
            <Card className="divide-y divide-line/50 p-0">
              {recent.map((r) => (
                <button key={r.id} onClick={() => router.push(`/catch/edit?trip=${r.id}`)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start hover:bg-surface-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.title || (r.location_id && idx.locById.get(r.location_id)?.name) || t("رحلة صيد", "Fishing trip")}
                      {r.technique_id && <span className="text-muted"> · {name(idx.techById.get(r.technique_id))}</span>}
                    </div>
                    <DualDate iso={r.started_at} override={r.hijri_date_override} className="text-xs text-muted" />
                  </div>
                  <Fish className="size-5 shrink-0 text-teal" />
                </button>
              ))}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
