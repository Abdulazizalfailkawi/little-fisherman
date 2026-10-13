"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Pencil, Star, Trash2, Waves } from "lucide-react";
import { CatchRow, TripCard } from "@/components/common";
import { LocationForm } from "@/components/LocationForm";
import { Badge, Button, Card, Empty, N, PageHeader, SectionTitle, Sheet, Stat } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { TIDE_STATIONS } from "@/lib/marine/stations";
import { catchLocation, pct, speciesCounts, summarize, tripRows } from "@/lib/stats";
import { fmtDepth, useDepthUnit } from "@/lib/depth";

const MapPicker = dynamic(() => import("@/components/MapPicker").then((m) => m.MapPicker), { ssr: false });

export default function Page() {
  return (
    <Suspense>
      <SpotPage />
    </Suspense>
  );
}

function SpotPage() {
  const id = useSearchParams().get("id");
  const { ds, idx, save, remove } = useStore();
  const { t, lang, name, num } = useI18n();
  const du = useDepthUnit();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const loc = id ? idx.locById.get(id) : undefined;
  const rows = useMemo(() => (loc ? tripRows(ds, idx, { locationId: loc.id }) : []), [ds, idx, loc]);
  const catches = useMemo(() => (loc ? ds.catches.filter((c) => catchLocation(c, idx) === loc.id).sort((a, b) => b.caught_at.localeCompare(a.caught_at)) : []), [ds, idx, loc]);
  if (!loc)
    return (
      <>
        <PageHeader title={t("الموقع", "Spot")} back="/spots" />
        <Empty icon="📍" title={t("غير موجود", "Not found")} />
      </>
    );
  const s = summarize(rows);
  const top = speciesCounts(catches).filter((x) => x.speciesId).slice(0, 5);
  const station = TIDE_STATIONS.find((x) => x.id === (loc.tide_station ?? "model"));

  return (
    <>
      <PageHeader
        title={lang === "ar" ? loc.name : loc.name_en || loc.name}
        subtitle={lang === "ar" ? loc.name_en ?? loc.area ?? undefined : loc.name}
        back="/spots"
        actions={
          <button onClick={() => setEdit(true)} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="edit">
            <Pencil className="size-5" />
          </button>
        }
      />
      {loc.lat != null ? (
        <MapPicker value={{ lat: loc.lat, lng: loc.lng! }} readOnly height={200} />
      ) : (
        <Card className="text-sm text-muted">{t("لا توجد إحداثيات — أضفها لتفعيل الطقس والمد.", "No coordinates — add them to enable weather and tide.")}</Card>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {loc.lat != null && (
          <Badge>
            <span className="ltr">
              {loc.lat}, {loc.lng}
            </span>
          </Badge>
        )}
        {loc.typical_depth_m != null && (
          <Badge>
            {t("العمق المعتاد", "Typical depth")} {fmtDepth(loc.typical_depth_m, du, lang)}
          </Badge>
        )}
        {station && <Badge tone="ocean">{station[lang]}</Badge>}
        {loc.is_demo && <Badge tone="ocean">{t("تجريبي", "Demo")}</Badge>}
      </div>
      {loc.notes && <Card className="mt-2 whitespace-pre-wrap text-sm">{loc.notes}</Card>}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => save("locations", { ...loc, is_favorite: !loc.is_favorite })}>
          <Star className={`size-4 ${loc.is_favorite ? "fill-warn text-warn" : ""}`} /> {loc.is_favorite ? t("مفضل", "Favourite") : t("إضافة للمفضلة", "Add to favourites")}
        </Button>
        {loc.lat != null && (
          <Button
            className="flex-1"
            onClick={() => {
              try {
                localStorage.setItem("ft.marineSpot", loc.id);
              } catch {}
              router.push("/");
            }}
          >
            <Waves className="size-4" /> {t("الظروف البحرية", "Marine conditions")}
          </Button>
        )}
      </div>

      <SectionTitle>{t("السجل في هذا الموقع", "History at this spot")}</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t("رحلات", "Trips")} value={s.trips} />
        <Stat label={t("أسماك", "Fish")} value={catches.length} />
        <Stat label={t("نجاح الرحلات", "Trip success")} value={pct(s.successRate)} sub={<N n={s.trips} />} />
        <Stat label={t("سمك/رحلة", "Fish/trip")} value={num(s.catchesPerTrip, 2)} />
      </div>
      {top.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {top.map((x) => (
            <Badge key={x.speciesId} tone="teal">
              {name(idx.speciesById.get(x.speciesId!))} ×{x.count}
            </Badge>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <SectionTitle>{t("الرحلات", "Trips")}</SectionTitle>
          <div className="space-y-2">
            {[...rows].reverse().slice(0, 20).map((r) => (
              <TripCard key={r.trip.id} trip={r.trip} />
            ))}
          </div>
        </>
      )}
      {catches.length > 0 && (
        <>
          <SectionTitle>{t("الصيدات", "Catches")}</SectionTitle>
          <Card className="p-2">
            {catches.slice(0, 30).map((c) => (
              <CatchRow key={c.id} c={c} showTrip />
            ))}
          </Card>
        </>
      )}
      <Button
        variant="danger"
        className="mt-8 w-full"
        onClick={async () => {
          if (!confirm(t("حذف الموقع؟ الرحلات تبقى بدون موقع.", "Delete spot? Trips stay, without a spot."))) return;
          await remove("locations", loc);
          router.replace("/spots");
        }}
      >
        <Trash2 className="size-4" /> {t("حذف الموقع", "Delete spot")}
      </Button>
      <Sheet open={edit} onClose={() => setEdit(false)} title={t("تعديل الموقع", "Edit spot")}>
        <LocationForm initial={loc} onDone={() => setEdit(false)} />
      </Sheet>
    </>
  );
}
