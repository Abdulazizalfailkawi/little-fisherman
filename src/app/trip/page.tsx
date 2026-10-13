"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Fish, Flag, ImagePlus, Pencil, Play, Trash2 } from "lucide-react";
import { CatchRow, DualDate, Photo } from "@/components/common";
import { EnvPanel } from "@/components/EnvPanel";
import { useToast } from "@/components/Toast";
import { TripSummary } from "@/components/TripSummary";
import { useNow } from "@/lib/hooks/useNow";
import { activeTrip, cancelTrip, elapsed, finishTrip, startTrip, statusOf, targetsOf } from "@/lib/trips";
import { Badge, Button, Card, Empty, LinkButton, Notice, PageHeader, SectionTitle, Sheet } from "@/components/ui";
import { MOON_EMOJI, effectiveMoonPhase, moonAt } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { EQUIP_LABEL, MOON_LABEL, SEA_LABEL, TIDE_LABEL, WIND_LABEL, label, useI18n } from "@/lib/i18n";
import { fmtDateTime, tripHours } from "@/lib/time";
import { fmtDepth, fmtDepthRange, useDepthUnit } from "@/lib/depth";
import { QuickCatchSheet } from "@/components/QuickCatch";

export default function Page() {
  return (
    <Suspense>
      <TripDetail />
    </Suspense>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-end">{v}</span>
    </div>
  );
}

function TripDetail() {
  const id = useSearchParams().get("id");
  const store = useStore();
  const { ds, idx, save, remove, addPhoto, addVideo } = store;
  const toast = useToast();
  const now = useNow(30_000);
  const { t, lang, name, num } = useI18n();
  const du = useDepthUnit();
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [addFish, setAddFish] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaErr, setMediaErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trip = id ? idx.tripById.get(id) : undefined;
  if (!trip)
    return (
      <>
        <PageHeader title={t("الرحلة", "Trip")} back="/trips" />
        <Empty icon="🔍" title={t("الرحلة غير موجودة", "Trip not found")} />
      </>
    );

  const catches = idx.catchesByTrip.get(trip.id) ?? [];
  const loc = trip.location_id ? idx.locById.get(trip.location_id) : null;
  const tech = trip.technique_id ? idx.techById.get(trip.technique_id) : null;
  const targets = targetsOf(ds, trip);
  const st = statusOf(trip);
  const other = activeTrip(ds);
  const hrs = tripHours(trip);
  const gear = ds.trip_equipment.filter((x) => x.trip_id === trip.id).map((x) => ds.equipment.find((e) => e.id === x.equipment_id)).filter(Boolean);
  const media = ds.trip_media.filter((x) => x.trip_id === trip.id);
  const moon = moonAt(trip.started_at);
  const em = effectiveMoonPhase(trip);
  const speciesCount = new Set(catches.map((c) => c.species_id).filter(Boolean)).size;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMediaBusy(true);
    setMediaErr(null);
    try {
      for (const f of Array.from(files)) {
        const m = f.type.startsWith("video/") ? await addVideo(f) : await addPhoto(f);
        if (!media.some((x) => x.media_id === m.id))
          await save("trip_media", { trip_id: trip.id, media_id: m.id, created_at: new Date().toISOString() });
      }
    } catch (e) {
      setMediaErr(
        (e as Error).message === "VIDEO_TOO_LARGE"
          ? t("الفيديو أكبر من ٢٥ ميغابايت", "Video is larger than 25 MB")
          : t("تعذرت قراءة الملف", "Couldn't read that file"),
      );
    } finally {
      setMediaBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <PageHeader
        title={trip.title || loc?.name || t("رحلة صيد", "Fishing trip")}
        subtitle={<DualDate iso={trip.started_at} override={trip.hijri_date_override} />}
        back="/trips"
        actions={
          <Link href={`/trip/edit?id=${trip.id}`} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="edit">
            <Pencil className="size-5" />
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={st === "active" ? "warn" : st === "planned" ? "ocean" : st === "cancelled" ? "bad" : "good"}>
          {{ planned: t("مخططة", "Planned"), active: t("جارية", "Active"), completed: t("منتهية", "Completed"), cancelled: t("ملغاة", "Cancelled") }[st]}
        </Badge>
        {st === "active" && <Badge>{t(`منذ ${elapsed(trip.started_at, now, "ar")}`, `for ${elapsed(trip.started_at, now, "en")}`)}</Badge>}
        {st !== "planned" && st !== "cancelled" && (catches.length > 0 ? <Badge tone="good">{t(`${catches.length} صيدة`, `${catches.length} catches`)}</Badge> : <Badge>{t("بدون صيد", "No catch yet")}</Badge>)}
        {targets.map((s) => (
          <Badge key={s} tone="teal">
            🎯 {name(idx.speciesById.get(s))}
          </Badge>
        ))}
        {trip.is_demo && <Badge tone="ocean">{t("تجريبي", "Demo")}</Badge>}
      </div>

      {st === "planned" && (
        <div className="flex gap-2">
          <Button
            size="lg"
            variant="teal"
            className="flex-1"
            disabled={!!(other && other.id !== trip.id)}
            onClick={async () => {
              await startTrip(store, trip);
              toast(t("بدأت الرحلة — بالتوفيق!", "Trip started — good luck!"));
            }}
          >
            <Play className="size-5" /> {t("ابدأ الرحلة", "Start trip")}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={async () => {
              if (!confirm(t("إلغاء هذه الرحلة؟ تبقى محفوظة كملغاة.", "Cancel this trip? It stays saved as cancelled."))) return;
              await cancelTrip(store, trip);
            }}
          >
            {t("إلغاء", "Cancel")}
          </Button>
        </div>
      )}
      {st === "planned" && other && other.id !== trip.id && (
        <p className="mt-1 text-xs text-warn">{t("لديك رحلة جارية — أنهِها قبل بدء هذه.", "You have an active trip — finish it before starting this one.")}</p>
      )}
      {st === "active" && (
        <div className="flex gap-2">
          <LinkButton href={`/catch/edit?trip=${trip.id}`} variant="teal" size="lg" className="flex-1">
            <Fish className="size-6" /> {t("سجّل صيدة", "Log catch")}
          </LinkButton>
          <Button
            size="lg"
            variant="secondary"
            onClick={async () => {
              await finishTrip(store, trip);
              toast(t("انتهت الرحلة", "Trip finished"));
              window.scrollTo({ top: 0 });
            }}
          >
            <Flag className="size-5" /> {t("أنهِ الرحلة", "Finish trip")}
          </Button>
        </div>
      )}
      {st === "completed" && (
        <>
          <TripSummary trip={trip} />
          <Button variant="secondary" className="mt-2 w-full" onClick={() => setAddFish(true)}>
            <Fish className="size-5" /> {t("＋ أضف سمكة لهذي الرحلة", "+ Add a fish to this trip")}
          </Button>
        </>
      )}

      <SectionTitle>{t(`الصيد (${catches.length})`, `Catches (${catches.length})`)}</SectionTitle>
      {catches.length ? (
        <Card className="p-2">
          {catches.map((c) => (
            <CatchRow key={c.id} c={c} />
          ))}
        </Card>
      ) : (
        <p className="px-1 text-sm text-muted">{t("لم تُسجّل أي سمكة في هذه الرحلة.", "No fish logged on this trip.")}</p>
      )}

      <SectionTitle>{t("التفاصيل", "Details")}</SectionTitle>
      <Card className="divide-y divide-line/40 py-1">
        <Row k={t("البداية", "Start")} v={fmtDateTime(trip.started_at, lang)} />
        <Row k={t("النهاية", "End")} v={trip.ended_at ? fmtDateTime(trip.ended_at, lang) : "—"} />
        <Row k={t("المدة", "Duration")} v={hrs != null ? `${num(hrs)} ${t("ساعة", "h")}` : "—"} />
        <Row k={t("الموقع", "Spot")} v={loc ? `${loc.name}${loc.area ? " · " + loc.area : ""}` : "—"} />
        {trip.lat != null && <Row k="GPS" v={<span className="ltr">{trip.lat}, {trip.lng}</span>} />}
        <Row k={t("الطريقة", "Technique")} v={tech ? name(tech) : "—"} />
        <Row k={t("المستهدف", "Target")} v={targets.length ? targets.map((x) => name(idx.speciesById.get(x))).join("، ") : "—"} />
        <Row k={t("العمق المستهدف", "Target depth")} v={fmtDepthRange(trip.target_depth_m, trip.target_depth_max_m, du, lang)} />
        {trip.lure_type && <Row k={t("الطُعم / الجك", "Lure / jig")} v={[trip.lure_type, trip.lure_weight_g ? `${trip.lure_weight_g} ${t("غ", "g")}` : null, trip.lure_color, trip.lure_size].filter(Boolean).join(" · ")} />}
        {trip.trolling_speed_kn != null && <Row k={t("سرعة التشخيط", "Trolling speed")} v={`${trip.trolling_speed_kn} ${t("عقدة", "kn")}`} />}
        {trip.planned_start_at && <Row k={t("الموعد المخطط", "Planned start")} v={fmtDateTime(trip.planned_start_at, lang)} />}
        <Row k={t("المد والجزر", "Tide")} v={trip.tide ? label(TIDE_LABEL, trip.tide, lang) : <span className="text-muted">{t("غير مسجل", "Not recorded")}</span>} />
        <Row
          k={t("القمر", "Moon")}
          v={
            <>
              {MOON_EMOJI[em.phase]} {label(MOON_LABEL, em.phase, lang)}{" "}
              <span className="text-xs text-muted">{em.calculated ? t(`(محسوب · ${Math.round(moon.illumination * 100)}٪)`, `(calculated · ${Math.round(moon.illumination * 100)}%)`) : t("(مُدخل)", "(entered)")}</span>
            </>
          }
        />
        <Row k={t("البحر", "Sea")} v={label(SEA_LABEL, trip.sea_state, lang)} />
        <Row
          k={t("الرياح", "Wind")}
          v={trip.wind_speed_kmh != null || trip.wind_dir ? `${trip.wind_speed_kmh ?? "—"} ${t("كم/س", "km/h")} ${trip.wind_dir ? label(WIND_LABEL, trip.wind_dir, lang) : ""}` : "—"}
        />
        <Row k={t("العمق", "Depth")} v={fmtDepth(trip.water_depth_m, du, lang)} />
        <Row k={t("الطقس", "Weather")} v={trip.weather ?? "—"} />
        <Row k="PE" v={trip.line_pe ?? "—"} />
        <Row k={t("الطُعم", "Lure / bait")} v={trip.lure_bait ?? "—"} />
      </Card>

      {gear.length > 0 && (
        <>
          <SectionTitle>{t("المعدات", "Gear")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {gear.map((g) => (
              <Badge key={g!.id} tone="ocean">
                {label(EQUIP_LABEL, g!.category, lang)}: {g!.name}
              </Badge>
            ))}
          </div>
        </>
      )}

      <SectionTitle>{t("البيئة والظروف", "Environment & conditions")}</SectionTitle>
      <EnvPanel trip={trip} />

      <SectionTitle
        action={
          <Button size="sm" variant="secondary" loading={mediaBusy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" /> {t("إضافة", "Add")}
          </Button>
        }
      >
        {t("صور وفيديو الرحلة", "Trip photos & videos")}
      </SectionTitle>
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {mediaErr && <Notice tone="bad" className="mb-2">{mediaErr}</Notice>}
      {media.length || catches.some((c) => c.photo_media_id) ? (
        <div className="grid grid-cols-3 gap-1.5">
          {[...media.map((m) => m.media_id), ...catches.map((c) => c.photo_media_id).filter((x): x is string => !!x)].map((mid) => (
            <button key={mid} onClick={() => setViewer(mid)} className="aspect-square overflow-hidden rounded-xl">
              <Photo mediaId={mid} className="size-full" />
            </button>
          ))}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">{t("لا توجد صور بعد.", "No photos yet.")}</p>
      )}

      {trip.notes && (
        <>
          <SectionTitle>{t("ملاحظات", "Notes")}</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm leading-relaxed">{trip.notes}</Card>
        </>
      )}

      <div className="mt-8">
        <Button variant="danger" className="w-full" onClick={() => setConfirmDel(true)}>
          <Trash2 className="size-4" /> {t("حذف الرحلة", "Delete trip")}
        </Button>
      </div>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title={t("حذف الرحلة؟", "Delete this trip?")}>
        <p className="mb-4 text-sm text-ink-2">
          {t(
            `سيتم حذف الرحلة و${catches.length} سمكة مسجلة فيها. لا يمكن التراجع (إلا من نسخة احتياطية).`,
            `This deletes the trip and its ${catches.length} catches. This can't be undone (except from a backup).`,
          )}
        </p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              await remove("trips", trip);
              router.replace("/trips");
            }}
          >
            {t("حذف", "Delete")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDel(false)}>
            {t("إلغاء", "Cancel")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!viewer} onClose={() => setViewer(null)} title={t("صورة", "Photo")}>
        {viewer && (
          <div className="space-y-3">
            <Photo mediaId={viewer} variant="full" className="max-h-[70dvh] w-full rounded-xl object-contain" />
            {media.some((m) => m.media_id === viewer) && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  const link = media.find((m) => m.media_id === viewer)!;
                  await remove("trip_media", link);
                  setViewer(null);
                }}
              >
                <Trash2 className="size-4" /> {t("إزالة من الرحلة", "Remove from trip")}
              </Button>
            )}
          </div>
        )}
      </Sheet>
      <QuickCatchSheet open={addFish} onClose={() => setAddFish(false)} fixedTripId={trip.id} />
    </>
  );
}
