"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Clock, LocateFixed, Save } from "lucide-react";
import { EquipmentPicker, LocationPicker, SpeciesPicker, getGps } from "@/components/pickers";
import { Button, Card, Choice, Field, Input, NumberInput, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { MOON_EMOJI, moonAt } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { lastUsed, newTrip } from "@/lib/factory";
import { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN, fmtHijri, hijriCalendarName, parseHijri, toHijri } from "@/lib/hijri";
import { MOON_LABEL, SEA_LABEL, TIDE_LABEL, WIND_LABEL, useI18n } from "@/lib/i18n";
import { fromLocalInput, nowLocalInput, toLocalInput } from "@/lib/time";
import { MOON_PHASES, SEA_STATES, TIDES, WIND_DIRS, type Trip } from "@/lib/types";
import { validateTrip } from "@/lib/validate";

export default function Page() {
  return (
    <Suspense>
      <TripEdit />
    </Suspense>
  );
}

function TripEdit() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const { ds, idx, save, remove } = useStore();
  const { t, lang } = useI18n();
  const router = useRouter();
  const existing = id ? idx.tripById.get(id) : undefined;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [equip, setEquip] = useState<string[]>([]);
  const [startIn, setStartIn] = useState("");
  const [endIn, setEndIn] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fixHijri, setFixHijri] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (trip) return;
    if (id && !existing) return; // wait for data
    const base = existing ?? newTrip({ ...lastUsed(ds), status: sp.get("start") ? "draft" : "completed" });
    setTrip(base);
    setStartIn(toLocalInput(base.started_at));
    setEndIn(toLocalInput(base.ended_at));
    setEquip(ds.trip_equipment.filter((x) => x.trip_id === base.id).map((x) => x.equipment_id));
    setFixHijri(!!base.hijri_date_override);
  }, [id, existing, ds, sp, trip]);

  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setTrip((p) => (p ? { ...p, [k]: v } : p));

  const startedIso = fromLocalInput(startIn);
  const computedHijri = useMemo(() => (startedIso ? toHijri(startedIso) : null), [startedIso]);
  const calcMoon = startedIso ? moonAt(startedIso) : null;
  const override = parseHijri(trip?.hijri_date_override);

  if (!trip) return <PageHeader title="…" back />;

  const errText = (k: string) =>
    errors[k] &&
    ({
      required: t("مطلوب", "Required"),
      before_start: t("النهاية قبل البداية", "End is before start"),
      too_long: t("أطول من ٧٢ ساعة — تأكد من التاريخ", "Longer than 72 h — check the date"),
      range: t("قيمة غير منطقية", "Value out of range"),
      long: t("النص طويل جداً", "Text too long"),
    }[errors[k]] ?? errors[k]);

  const onSave = async (status?: Trip["status"], endOverride?: string) => {
    const endVal = endOverride ?? endIn;
    const next: Trip = {
      ...trip,
      status: status ?? trip.status,
      started_at: fromLocalInput(startIn) ?? "",
      ended_at: endVal ? fromLocalInput(endVal) : null,
      title: trip.title?.trim() || null,
      hijri_date_override: fixHijri ? trip.hijri_date_override : null,
    };
    const e = validateTrip(next);
    setErrors(e);
    if (Object.keys(e).length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    await save("trips", next);
    const before = ds.trip_equipment.filter((x) => x.trip_id === next.id);
    const toRemove = before.filter((x) => !equip.includes(x.equipment_id));
    const toAdd = equip.filter((eid) => !before.some((x) => x.equipment_id === eid));
    if (toRemove.length) await remove("trip_equipment", toRemove);
    if (toAdd.length)
      await save(
        "trip_equipment",
        toAdd.map((eid) => ({ trip_id: next.id, equipment_id: eid, created_at: new Date().toISOString() })),
      );
    router.replace(`/trip?id=${next.id}`);
  };

  const months = lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  const h = override ?? computedHijri ?? { year: 1448, month: 1, day: 1 };
  const setHijriPart = (part: "year" | "month" | "day", v: number) => {
    const n = { ...h, [part]: v };
    set("hijri_date_override", `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`);
  };

  return (
    <>
      <PageHeader title={existing ? t("تعديل الرحلة", "Edit trip") : t("رحلة جديدة", "New trip")} back />
      {Object.keys(errors).length > 0 && <Notice tone="bad" className="mb-3">{t("راجع الحقول المظللة", "Please check the highlighted fields")}</Notice>}

      <div className="space-y-3">
        <Card className="space-y-4">
          <Choice
            value={trip.status}
            allowClear={false}
            onChange={(v) => v && set("status", v)}
            options={[
              { value: "draft", label: t("🟡 جارية / مسودة", "🟡 In progress / draft") },
              { value: "completed", label: t("✅ منتهية", "✅ Completed") },
            ]}
          />
          <Field label={t("اسم الرحلة (اختياري)", "Trip name (optional)")} error={errText("title")}>
            <Input value={trip.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder={t("مثال: جيقنق قاروه", "e.g. Qaruh jigging")} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("البداية (بتوقيت الكويت)", "Start (Kuwait time)")} error={errText("started_at")}>
              <Input type="datetime-local" value={startIn} onChange={(e) => setStartIn(e.target.value)} />
            </Field>
            <Field label={t("النهاية", "End")} error={errText("ended_at")} hint={!endIn ? t("بدونها لا تُحسب ساعات الصيد", "Without it, hours aren't counted") : undefined}>
              <div className="flex gap-2">
                <Input type="datetime-local" value={endIn} onChange={(e) => setEndIn(e.target.value)} />
                <Button type="button" variant="secondary" onClick={() => setEndIn(nowLocalInput())} aria-label="now">
                  <Clock className="size-4" />
                </Button>
              </div>
            </Field>
          </div>
          {computedHijri && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {t("التاريخ الهجري:", "Hijri date:")} <b>{fmtHijri(override ?? computedHijri, lang)}</b>
                  {override && <span className="text-warn"> ({t("مصحح يدوياً", "manually corrected")})</span>}
                </span>
                <button type="button" className="text-teal" onClick={() => setFixHijri((v) => !v)}>
                  {fixHijri ? t("إلغاء التصحيح", "Undo correction") : t("تصحيح", "Correct")}
                </button>
              </div>
              {fixHijri && (
                <div className="mt-3 grid grid-cols-[1fr_2fr_1.3fr] gap-2">
                  <NumberInput value={h.day} onChange={(v) => v && v >= 1 && v <= 30 && setHijriPart("day", Math.round(v))} aria-label="day" />
                  <select
                    value={h.month}
                    onChange={(e) => setHijriPart("month", Number(e.target.value))}
                    className="min-h-12 rounded-xl border border-line bg-surface-3 px-2"
                  >
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <NumberInput value={h.year} onChange={(v) => v && v > 1300 && v < 1500 && setHijriPart("year", Math.round(v))} aria-label="year" />
                </div>
              )}
              <p className="mt-2 text-xs text-muted">
                {t(
                  `محسوب بتقويم أم القرى (${hijriCalendarName()}). قد يختلف يوماً عن الرؤية الرسمية في الكويت — صححه عند الحاجة أو اضبط الإزاحة العامة من الإعدادات.`,
                  `Calculated with Umm al-Qura (${hijriCalendarName()}). Kuwait's official moon-sighting date can differ by a day — correct it here or set a global offset in Settings.`,
                )}
              </p>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <Field label={t("موقع الصيد", "Fishing spot")}>
            <LocationPicker value={trip.location_id} onChange={(v) => set("location_id", v)} />
          </Field>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {trip.lat != null ? <span className="ltr">GPS: {trip.lat}, {trip.lng}</span> : gpsMsg ?? t("إحداثيات الرحلة (اختياري)", "Trip GPS (optional)")}
            </span>
            {trip.lat != null ? (
              <Button size="sm" variant="ghost" onClick={() => setTrip({ ...trip, lat: null, lng: null })}>
                {t("إزالة", "Remove")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    const g = await getGps();
                    setTrip((p) => (p ? { ...p, lat: g.lat, lng: g.lng } : p));
                  } catch (e) {
                    setGpsMsg((e as Error).message === "DENIED" ? t("تم رفض الإذن", "Permission denied") : t("تعذر تحديد الموقع", "Location unavailable"));
                  }
                }}
              >
                <LocateFixed className="size-4" /> GPS
              </Button>
            )}
          </div>
          <Field label={t("طريقة الصيد", "Technique")}>
            <Choice
              value={trip.technique_id}
              onChange={(v) => set("technique_id", v)}
              options={[...ds.techniques].sort((a, b) => a.sort_order - b.sort_order).map((x) => ({ value: x.id, label: t(x.name_ar, x.name_en) }))}
            />
          </Field>
          <Field label={t("النوع المستهدف", "Target species")}>
            <SpeciesPicker value={trip.target_species_id} onChange={(v) => set("target_species_id", v)} placeholder={t("اختياري", "Optional")} />
          </Field>
        </Card>

        <details className="group rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-4" open={!!(trip.tide || trip.sea_state || trip.wind_speed_kmh)}>
          <summary className="cursor-pointer list-none font-semibold">🌊 {t("الظروف (اختياري)", "Conditions (optional)")}</summary>
          <div className="mt-4 space-y-4">
            <Field label={t("المد والجزر", "Tide")} hint={t("أدخله فقط إذا كنت تعرفه — لا نخمّنه", "Only enter it if you know it — we never guess")}>
              <Choice value={trip.tide} onChange={(v) => set("tide", v)} options={TIDES.map((x) => ({ value: x, label: TIDE_LABEL[x][lang] }))} />
            </Field>
            <Field
              label={t("طور القمر", "Moon phase")}
              hint={calcMoon ? t(`المحسوب: ${MOON_EMOJI[calcMoon.phase]} ${MOON_LABEL[calcMoon.phase].ar} (${Math.round(calcMoon.illumination * 100)}٪ إضاءة)`, `Calculated: ${MOON_EMOJI[calcMoon.phase]} ${MOON_LABEL[calcMoon.phase].en} (${Math.round(calcMoon.illumination * 100)}% lit)`) : undefined}
            >
              <Select
                value={trip.moon_phase}
                onChange={(v) => set("moon_phase", v as Trip["moon_phase"])}
                placeholder={t("استخدم القيمة المحسوبة", "Use calculated value")}
                options={MOON_PHASES.map((m) => ({ value: m, label: `${MOON_EMOJI[m]} ${MOON_LABEL[m][lang]}` }))}
              />
            </Field>
            <Field label={t("حالة البحر", "Sea state")}>
              <Choice value={trip.sea_state} onChange={(v) => set("sea_state", v)} options={SEA_STATES.map((x) => ({ value: x, label: SEA_LABEL[x][lang] }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("سرعة الرياح (كم/س)", "Wind (km/h)")} error={errText("wind_speed_kmh")}>
                <NumberInput value={trip.wind_speed_kmh} onChange={(v) => set("wind_speed_kmh", v)} />
              </Field>
              <Field label={t("اتجاه الرياح", "Wind direction")}>
                <Select value={trip.wind_dir} onChange={(v) => set("wind_dir", v as Trip["wind_dir"])} options={WIND_DIRS.map((d) => ({ value: d, label: WIND_LABEL[d][lang] }))} />
              </Field>
              <Field label={t("العمق (م)", "Depth (m)")} error={errText("water_depth_m")}>
                <NumberInput value={trip.water_depth_m} onChange={(v) => set("water_depth_m", v)} />
              </Field>
              <Field label={t("الحرارة (°م)", "Air temp (°C)")} error={errText("air_temp_c")}>
                <NumberInput value={trip.air_temp_c} onChange={(v) => set("air_temp_c", v)} />
              </Field>
            </div>
            <Field label={t("الطقس", "Weather")}>
              <Input value={trip.weather ?? ""} onChange={(e) => set("weather", e.target.value || null)} placeholder={t("مثال: صافٍ، رطوبة عالية", "e.g. clear, humid")} />
            </Field>
            <p className="text-xs text-muted">
              {t(
                "يمكنك جلب بيانات الطقس من مصدر خارجي في صفحة الرحلة بعد الحفظ (مع ذكر المصدر والوقت).",
                "You can fetch weather from an external source on the trip page after saving (with source and timestamp).",
              )}
            </p>
          </div>
        </details>

        <details className="rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-4" open={equip.length > 0}>
          <summary className="cursor-pointer list-none font-semibold">🎣 {t("المعدات (اختياري)", "Gear (optional)")}</summary>
          <div className="mt-4 space-y-4">
            <EquipmentPicker value={equip} onChange={setEquip} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("الخيط PE", "Line PE")} error={errText("line_pe")}>
                <NumberInput value={trip.line_pe} onChange={(v) => set("line_pe", v)} />
              </Field>
              <Field label={t("الطُعم / الجك", "Lure / jig / bait")}>
                <Input value={trip.lure_bait ?? ""} onChange={(e) => set("lure_bait", e.target.value || null)} />
              </Field>
            </div>
            <Field label={t("ملاحظات المعدات", "Gear notes")}>
              <Input value={trip.gear_notes ?? ""} onChange={(e) => set("gear_notes", e.target.value || null)} />
            </Field>
          </div>
        </details>

        <Card>
          <Field label={t("ملاحظات", "Notes")} error={errText("notes")}>
            <Textarea value={trip.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
          </Field>
        </Card>
      </div>

      <div className="sticky bottom-[calc(var(--safe-bottom)+5.75rem)] z-20 mt-4 flex gap-2 rounded-2xl border border-line bg-navy/95 p-2 backdrop-blur">
        <Button size="lg" className="flex-1" loading={saving} onClick={() => onSave()}>
          <Save className="size-5" /> {t("حفظ", "Save")}
        </Button>
        {trip.status === "draft" && (
          <Button
            size="lg"
            variant="teal"
            loading={saving}
            onClick={() => {
              const end = endIn || nowLocalInput();
              setEndIn(end);
              void onSave("completed", end);
            }}
          >
            {t("إنهاء الرحلة", "Finish trip")}
          </Button>
        )}
      </div>
    </>
  );
}
