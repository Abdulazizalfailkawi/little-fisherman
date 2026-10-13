"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Photo } from "@/components/common";
import { NewSpeciesForm } from "@/components/pickers";
import { Badge, Button, Choice, Empty, Input, PageHeader, Progress, SectionTitle, Sheet } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/normalize";
import { speciesStats } from "@/lib/stats";
import { fmtDate } from "@/lib/time";

export default function CollectionPage() {
  const { ds, idx } = useStore();
  const { t, lang, name } = useI18n();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"count" | "recent" | "name">("count");
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => ds.species.map((s) => speciesStats(s, ds, idx)), [ds, idx]);
  const shown = all.filter((s) => matches(q, s.species.name_ar, s.species.name_en, s.species.scientific_name, ...s.species.aliases));
  const caught = shown
    .filter((s) => s.count > 0)
    .sort((a, b) =>
      sort === "count" ? b.count - a.count : sort === "recent" ? b.last!.caught_at.localeCompare(a.last!.caught_at) : name(a.species).localeCompare(name(b.species)),
    );
  const notYet = shown.filter((s) => s.count === 0).sort((a, b) => name(a.species).localeCompare(name(b.species)));
  const caughtTotal = all.filter((s) => s.count > 0).length;
  const unidentified = ds.catches.filter((c) => !c.species_id).length;

  return (
    <>
      <PageHeader section="stats"
        title={t("مجموعتي", "My Fish Collection")}
        subtitle={t(`${caughtTotal} من ${all.length} نوع`, `${caughtTotal} of ${all.length} species`)}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} aria-label="add species">
            <Plus className="size-5" />
          </Button>
        }
      />
      <Progress value={all.length ? caughtTotal / all.length : 0} />
      <div className="mt-3 space-y-3">
        <Input placeholder={t("ابحث عن نوع…", "Search species…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Choice
          value={sort}
          allowClear={false}
          onChange={(v) => v && setSort(v)}
          options={[
            { value: "count", label: t("الأكثر صيداً", "Most caught") },
            { value: "recent", label: t("الأحدث", "Recent") },
            { value: "name", label: t("الاسم", "Name") },
          ]}
        />
      </div>

      {unidentified > 0 && (
        <Link href="/gallery?unidentified=1" className="mt-3 block rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-sm text-warn">
          {t(`${unidentified} سمكة بدون نوع محدد — اضغط لتحديدها`, `${unidentified} fish without a species — tap to identify`)}
        </Link>
      )}

      {caught.length === 0 && notYet.length === 0 ? (
        <div className="mt-6">
          <Empty icon="🐟" title={t("لا توجد أنواع", "No species")} />
        </div>
      ) : null}

      {caught.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {caught.map((s) => (
            <Link key={s.species.id} href={`/species?id=${s.species.id}`} className="overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-surface/80 hover:bg-surface-2">
              <div className="relative">
                <Photo mediaId={s.bestPhotoMediaId} className="aspect-[4/3] w-full" fallback={<span className="text-4xl">🐟</span>} />
                <span className="absolute end-2 top-2 rounded-lg bg-teal px-2 py-0.5 text-sm font-bold text-abyss">×{s.count}</span>
              </div>
              <div className="p-2.5">
                <div className="truncate font-semibold">{name(s.species)}</div>
                <div className="truncate text-xs text-muted">{t(s.species.name_en ?? "", s.species.name_ar)}</div>
                <div className="mt-1 text-xs text-ink-2">{t("آخر صيد", "Last")}: {fmtDate(s.last!.caught_at, lang)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {notYet.length > 0 && (
        <>
          <SectionTitle>{t("لم تصطدها بعد", "Not caught yet")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {notYet.map((s) => (
              <Link key={s.species.id} href={`/species?id=${s.species.id}`}>
                <Badge className="py-1.5 text-sm opacity-70">{name(s.species)}</Badge>
              </Link>
            ))}
          </div>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t("نوع جديد", "New species")}>
        <NewSpeciesForm onDone={() => setAdding(false)} />
      </Sheet>
    </>
  );
}
