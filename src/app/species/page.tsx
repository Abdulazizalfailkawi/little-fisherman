"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { GitMerge, Pencil, Trash2 } from "lucide-react";
import { CatchRow, MeasureTag, Photo } from "@/components/common";
import { NewSpeciesForm, SpeciesSheet } from "@/components/pickers";
import { SpeciesAnalytics } from "@/components/SpeciesAnalytics";
import { Badge, Button, Card, Empty, Notice, PageHeader, SectionTitle, Sheet, Stat } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { MIN_SAMPLE, speciesStats } from "@/lib/stats";
import { depthBins } from "@/lib/analyticsExtra";
import { fmtDate } from "@/lib/time";

export default function Page() {
  return (
    <Suspense>
      <SpeciesPage />
    </Suspense>
  );
}

function SpeciesPage() {
  const id = useSearchParams().get("id");
  const { ds, idx, save, remove } = useStore();
  const { t, lang, name, num } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const sp = id ? idx.speciesById.get(id) : undefined;
  const st = useMemo(() => (sp ? speciesStats(sp, ds, idx) : null), [sp, ds, idx]);

  if (!sp || !st)
    return (
      <>
        <PageHeader title={t("النوع", "Species")} back="/collection" />
        <Empty icon="🔍" title={t("غير موجود", "Not found")} />
      </>
    );

  const mostInTrip = (() => {
    const m = new Map<string, number>();
    for (const c of st.catches) if (c.trip_id) m.set(c.trip_id, (m.get(c.trip_id) ?? 0) + 1);
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { trip: idx.tripById.get(best[0]), n: best[1] } : null;
  })();

  const merge = async (targetId: string | null) => {
    setMerging(false);
    if (!targetId || targetId === sp.id) return;
    const target = idx.speciesById.get(targetId)!;
    // Re-point everything at the target, keep this name as an alias, then delete.
    await save("catches", ds.catches.filter((c) => c.species_id === sp.id).map((c) => ({ ...c, species_id: targetId })));
    await save("trips", ds.trips.filter((x) => x.target_species_id === sp.id).map((x) => ({ ...x, target_species_id: targetId })));
    await save("goals", ds.goals.filter((g) => g.species_id === sp.id).map((g) => ({ ...g, species_id: targetId })));
    const aliases = [...new Set([...target.aliases, sp.name_ar, ...(sp.name_en ? [sp.name_en] : []), ...sp.aliases])];
    await save("species", { ...target, aliases });
    await remove("species", sp);
    router.replace(`/species?id=${targetId}`);
  };

  return (
    <>
      <PageHeader
        title={name(sp)}
        subtitle={
          <>
            {t(sp.name_en ?? "", sp.name_ar)} {sp.scientific_name && <i>· {sp.scientific_name}</i>}
          </>
        }
        back="/collection"
        actions={
          <button onClick={() => setEditing(true)} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="edit">
            <Pencil className="size-5" />
          </button>
        }
      />

      <Photo mediaId={st.bestPhotoMediaId} variant="full" className="aspect-video w-full rounded-[var(--radius-card)]" fallback={<span className="text-6xl">🐟</span>} />
      {sp.notes && <Notice className="mt-3">{sp.notes}</Notice>}
      {sp.aliases.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sp.aliases.map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
        </div>
      )}

      {st.count === 0 ? (
        <div className="mt-4">
          <Empty icon="🎯" title={t("لم تصطد هذا النوع بعد", "You haven't caught this species yet")} />
          <SpeciesAnalytics sp={sp} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={t("عدد مرات الصيد", "Times caught")} value={st.count} sub={t(`${st.kept} محتفظ · ${st.released} مُطلق`, `${st.kept} kept · ${st.released} released`)} />
            <Stat label={t("أول مرة", "First catch")} value={<span className="text-base">{fmtDate(st.first!.caught_at, lang)}</span>} />
            <Stat label={t("آخر مرة", "Most recent")} value={<span className="text-base">{fmtDate(st.last!.caught_at, lang)}</span>} />
            <Stat
              label={t("متوسط الوزن (مقاس)", "Avg weight (measured)")}
              value={st.avgWeight ? <span>{num(st.avgWeight.value, 2)} {t("كغ", "kg")}</span> : "—"}
              sub={st.avgWeight ? t(`من ${st.avgWeight.n} قياس`, `from ${st.avgWeight.n} measurements`) : t("لا قياسات بعد", "no measurements yet")}
            />
            <Stat
              label={t("متوسط الطول (مقاس)", "Avg length (measured)")}
              value={st.avgLength ? <span>{num(st.avgLength.value)} {t("سم", "cm")}</span> : "—"}
              sub={st.avgLength ? t(`من ${st.avgLength.n} قياس`, `from ${st.avgLength.n} measurements`) : t("لا قياسات بعد", "no measurements yet")}
            />
            <Stat label={t("أكثر عدد في رحلة", "Most in one trip")} value={mostInTrip?.n ?? "—"} sub={mostInTrip?.trip ? fmtDate(mostInTrip.trip.started_at, lang) : undefined} />
          </div>

          <SectionTitle>{t("الأرقام القياسية لهذا النوع", "Records for this species")}</SectionTitle>
          <Card className="space-y-3">
            {st.heaviest?.weight_kg != null && (
              <Link href={`/catch?id=${st.heaviest.id}`} className="flex items-center gap-3">
                <Photo mediaId={st.heaviest.photo_media_id} className="size-14 rounded-xl" />
                <div className="flex-1">
                  <div className="text-xs text-muted">{t("الأثقل", "Heaviest")}</div>
                  <div className="font-semibold">{st.heaviest.weight_kg} {t("كغ", "kg")}</div>
                  <div className="text-xs text-muted">{fmtDate(st.heaviest.caught_at, lang)}</div>
                </div>
                <MeasureTag estimate={st.heaviest.weight_is_estimate} />
              </Link>
            )}
            {st.longest?.length_cm != null && (
              <Link href={`/catch?id=${st.longest.id}`} className="flex items-center gap-3">
                <Photo mediaId={st.longest.photo_media_id} className="size-14 rounded-xl" />
                <div className="flex-1">
                  <div className="text-xs text-muted">{t("الأطول", "Longest")}</div>
                  <div className="font-semibold">{st.longest.length_cm} {t("سم", "cm")}</div>
                  <div className="text-xs text-muted">{fmtDate(st.longest.caught_at, lang)}</div>
                </div>
                <MeasureTag estimate={st.longest.length_is_estimate} />
              </Link>
            )}
            {st.heaviest?.weight_kg == null && st.longest?.length_cm == null && <p className="text-sm text-muted">{t("لا توجد قياسات مسجلة.", "No measurements recorded.")}</p>}
          </Card>

          <SectionTitle>{t("أين وكيف", "Where & how")}</SectionTitle>
          <Card className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted">{t("المواقع", "Spots")}</div>
              <div className="flex flex-wrap gap-1.5">
                {st.locations.length ? st.locations.map((l) => <Badge key={l.locationId}>{idx.locById.get(l.locationId)?.name} ×{l.count}</Badge>) : "—"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("الطرق", "Techniques")}</div>
              <div className="flex flex-wrap gap-1.5">
                {st.techniques.length ? st.techniques.map((x) => <Badge key={x.techniqueId} tone="ocean">{name(idx.techById.get(x.techniqueId))} ×{x.count}</Badge>) : "—"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("العمق الفعلي (م)", "Actual depth (m)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const d = depthBins(st.catches, 5);
                  return (
                    <>
                      {d.bins.map((b) => (
                        <Badge key={b.label}>
                          <span className="ltr">{b.label}</span> ×{b.count}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted">{t(`(${d.known} بعمق مسجل، ${d.missing} بدون)`, `(${d.known} with depth, ${d.missing} without)`)}</span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("أكثر الأوقات صيداً (من بياناتك)", "Most productive hours (your data)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {st.hours.slice(0, 4).map((h) => (
                  <Badge key={h.hour} tone="teal">
                    <span>{String(h.hour).padStart(2, "0")}:00</span> ×{h.count}
                  </Badge>
                ))}
              </div>
              {st.count < MIN_SAMPLE && (
                <p className="mt-1 text-xs text-muted">{t(`عينة صغيرة (${st.count}) — ليست نمطاً موثوقاً بعد.`, `Small sample (${st.count}) — not a reliable pattern yet.`)}</p>
              )}
            </div>
          </Card>

          <SpeciesAnalytics sp={sp} />

          <SectionTitle>{t("سجل الصيد", "Catch history")}</SectionTitle>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {st.catches
              .filter((c) => c.photo_media_id)
              .slice(-8)
              .reverse()
              .map((c) => (
                <Link key={c.id} href={`/catch?id=${c.id}`} className="aspect-square overflow-hidden rounded-xl">
                  <Photo mediaId={c.photo_media_id} className="size-full" />
                </Link>
              ))}
          </div>
          <Card className="p-2">
            {[...st.catches].reverse().map((c) => (
              <CatchRow key={c.id} c={c} showTrip />
            ))}
          </Card>
        </>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setMerging(true)}>
          <GitMerge className="size-4" /> {t("دمج مع نوع آخر", "Merge into…")}
        </Button>
        <Button variant="danger" onClick={() => setConfirmDel(true)}>
          <Trash2 className="size-4" /> {t("حذف النوع", "Delete species")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {t("استخدم الدمج إذا كان هذا النوع مكرراً بتهجئة أخرى — تنتقل كل الصيدات ويُحفظ الاسم كاسم بديل.", "Use merge if this is a duplicate spelling — all catches move over and this name is kept as an alias.")}
      </p>

      <Sheet open={editing} onClose={() => setEditing(false)} title={t("تعديل النوع", "Edit species")}>
        <NewSpeciesForm initial={sp} onDone={() => setEditing(false)} />
      </Sheet>
      <SpeciesSheet open={merging} onClose={() => setMerging(false)} onPick={merge} species={ds.species.filter((s) => s.id !== sp.id)} />
      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title={t("حذف النوع؟", "Delete species?")}>
        <p className="mb-4 text-sm text-ink-2">
          {st.count
            ? t(`لديك ${st.count} صيدة من هذا النوع. ستصبح «غير محددة». الأفضل استخدام الدمج.`, `You have ${st.count} catches of this species. They'll become "unidentified". Merging is usually better.`)
            : t("لا توجد صيدات مرتبطة.", "No catches are linked to it.")}
        </p>
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            await remove("species", sp);
            router.replace("/collection");
          }}
        >
          {t("حذف", "Delete")}
        </Button>
      </Sheet>
    </>
  );
}
