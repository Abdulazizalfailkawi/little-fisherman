"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LocateFixed, MapPin, Star } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { uuid } from "@/lib/ids";
import { useI18n } from "@/lib/i18n";
import { FINTAS_AREA, TIDE_STATIONS } from "@/lib/marine/stations";
import { normalizeName } from "@/lib/normalize";
import type { Location } from "@/lib/types";
import { getGps } from "@/lib/gps";
import { Button, Choice, Field, Input, NumberInput, Select, Textarea, Toggle } from "./ui";

const MapPicker = dynamic(() => import("./MapPicker").then((m) => m.MapPicker), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-surface-2" />,
});

export function LocationForm({ initial, onDone }: { initial?: Location; onDone: (id: string | null) => void }) {
  const { ds, save } = useStore();
  const { t, lang } = useI18n();
  const [nameV, setName] = useState(initial?.name ?? "");
  const [nameEn, setNameEn] = useState(initial?.name_en ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [kind, setKind] = useState<Location["kind"]>(initial?.kind ?? "boat");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(initial?.lat != null ? { lat: initial.lat, lng: initial.lng! } : null);
  const [center, setCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [depth, setDepth] = useState<number | null>(initial?.typical_depth_m ?? null);
  const [station, setStation] = useState<string | null>(initial?.tide_station ?? "model");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fav, setFav] = useState(initial?.is_favorite ?? false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [latIn, setLatIn] = useState<number | null>(initial?.lat ?? null);
  const [lngIn, setLngIn] = useState<number | null>(initial?.lng ?? null);
  const dup = ds.locations.find((l) => l.id !== initial?.id && normalizeName(l.name) === normalizeName(nameV));

  const setCoords = (v: { lat: number; lng: number } | null) => {
    setGps(v);
    setLatIn(v?.lat ?? null);
    setLngIn(v?.lng ?? null);
  };
  const typedValid = latIn != null && lngIn != null && latIn >= -90 && latIn <= 90 && lngIn >= -180 && lngIn <= 180;

  const submit = async () => {
    if (!nameV.trim() || dup) return;
    const ts = new Date().toISOString();
    const row: Location = {
      id: initial?.id ?? uuid(),
      name: nameV.trim(),
      name_en: nameEn.trim() || null,
      area: area.trim() || null,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      kind,
      notes: notes.trim() || null,
      typical_depth_m: depth,
      tide_station: station,
      is_favorite: fav,
      is_demo: initial?.is_demo ?? false,
      created_at: initial?.created_at ?? ts,
      updated_at: ts,
    };
    await save("locations", row);
    onDone(row.id);
  };

  return (
    <div className="space-y-3">
      <Field label={t("اسم الموقع (عربي) *", "Spot name (Arabic) *")} error={dup ? t("الاسم مستخدم مسبقاً", "Name already used") : null}>
        <Input value={nameV} onChange={(e) => setName(e.target.value)} dir="rtl" placeholder="مثال: نقعة الفنطاس" />
      </Field>
      <Field label={t("الاسم بالإنجليزي", "English name")}>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" placeholder="e.g. Al-Fintas reef" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("المنطقة", "Area")}>
          <Input value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <Field label={t("العمق المعتاد (م)", "Typical depth (m)")}>
          <NumberInput value={depth} onChange={setDepth} />
        </Field>
      </div>
      <Choice
        value={kind}
        allowClear={false}
        onChange={(v) => v && setKind(v)}
        options={[
          { value: "boat", label: t("قارب", "Boat") },
          { value: "shore", label: t("ساحل", "Shore") },
          { value: "pier", label: t("جسر / رصيف", "Pier") },
          { value: "other", label: t("أخرى", "Other") },
        ]}
      />

      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-ink-2">
            <MapPin className="size-4" />
            {gps ? <span className="ltr">{gps.lat}, {gps.lng}</span> : t("اضغط على الخريطة لتحديد الموقع", "Tap the map to drop a pin")}
          </span>
          {gps && (
            <Button size="sm" variant="ghost" onClick={() => setCoords(null)}>
              {t("إزالة", "Remove")}
            </Button>
          )}
        </div>
        <MapPicker value={gps} onChange={setCoords} center={center} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={locating}
            onClick={async () => {
              setGpsErr(null);
              setLocating(true);
              try {
                setCoords(await getGps());
              } catch (e) {
                setGpsErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع", "Location permission denied") : t("تعذر تحديد الموقع", "Couldn't get location"));
              } finally {
                setLocating(false);
              }
            }}
          >
            <LocateFixed className="size-4" /> {t("موقعي الحالي", "Use GPS")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCenter({ ...FINTAS_AREA })}>
            {t("اذهب لمنطقة الفنطاس", "Go to Al-Fintas area")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput value={latIn} onChange={setLatIn} placeholder="lat 29.xxxxx" aria-label="latitude" />
          <NumberInput value={lngIn} onChange={setLngIn} placeholder="lng 48.xxxxx" aria-label="longitude" />
        </div>
        {typedValid && (latIn !== gps?.lat || lngIn !== gps?.lng) && (
          <Button size="sm" variant="secondary" onClick={() => setCoords({ lat: latIn!, lng: lngIn! })}>
            {t("استخدم الإحداثيات المكتوبة", "Use typed coordinates")}
          </Button>
        )}
        <p className="text-xs text-muted">
          {gpsErr ??
            t(
              "زر الفنطاس يحرّك الخريطة فقط — حدد نقطتك الفعلية بنفسك. إذن GPS يُطلب فقط عند الضغط. الإحداثيات خاصة بحسابك ولا تُشارك.",
              "The Al-Fintas button only moves the map — drop your actual spot yourself. GPS permission is only requested when tapped. Coordinates stay private to your account.",
            )}
        </p>
      </div>

      <Field label={t("مرجع المد والجزر", "Tide reference")}>
        <Select value={station} onChange={setStation} options={TIDE_STATIONS.map((s) => ({ value: s.id, label: s[lang] }))} />
      </Field>
      <Field label={t("ملاحظات عن الموقع", "Notes about the spot")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Toggle
        checked={fav}
        onChange={setFav}
        label={
          <span className="flex items-center gap-1.5">
            <Star className="size-4 text-warn" /> {t("موقع مفضل", "Favourite spot")}
          </span>
        }
      />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={!nameV.trim() || !!dup}>
          {t("حفظ", "Save")}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t("إلغاء", "Cancel")}
        </Button>
      </div>
    </div>
  );
}
