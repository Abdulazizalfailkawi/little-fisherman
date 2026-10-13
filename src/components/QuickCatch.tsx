"use client";

// Floating "+" button → small sheet for logging a catch in seconds while at
// sea: photo, fish name and spot. Saved catches are linked to the active trip
// when there is one; otherwise they are stand-alone and still counted in the
// statistics.

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2, LocateFixed, X } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { getGps } from "@/lib/gps";
import { newCatch } from "@/lib/factory";
import { uuid } from "@/lib/ids";
import { useI18n } from "@/lib/i18n";
import { normalizeName, speciesKeys } from "@/lib/normalize";
import { targetsOf } from "@/lib/trips";
import { isActiveStatus, type Species } from "@/lib/types";
import { Photo } from "./common";
import { useToast } from "./Toast";
import { Button, Field, Input, Notice, Select, Sheet, cn } from "./ui";

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const HIDDEN = ["/catch/edit", "/trip/edit", "/login"];

export function QuickCatch() {
  const { ds, idx, save, addPhoto } = useStore();
  const { t, lang, name } = useI18n();
  const toast = useToast();
  const path = usePathname();
  const cam = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fish, setFish] = useState("");
  const [loc, setLoc] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  if (HIDDEN.some((p) => path.startsWith(p))) return null;

  const active = ds.trips.find((x) => isActiveStatus(x.status)) ?? null;
  const spots = ds.locations.filter((l) => l.lat != null).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const quick = [
    ...ds.species.filter((s) => normalizeName(s.name_ar) === normalizeName("بالول")).map((s) => s.id),
    ...(active ? targetsOf(ds, active) : []),
    ...[...ds.catches].sort((a, b) => b.caught_at.localeCompare(a.caught_at)).map((c) => c.species_id).filter((x): x is string => !!x),
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

  const openSheet = () => {
    let spot: string | null = null;
    try {
      spot = localStorage.getItem("ft.marineSpot");
    } catch {}
    setLoc(active?.location_id ?? (spot && idx.locById.has(spot) ? spot : null));
    setFish("");
    setPhoto(null);
    setGps(null);
    setErr(null);
    setOpen(true);
  };

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      setPhoto((await addPhoto(f)).id);
    } catch {
      setErr(t("تعذرت قراءة الصورة، جرّب مرة ثانية", "Couldn't read that photo, try again"));
    } finally {
      setBusy(false);
      if (cam.current) cam.current.value = "";
    }
  };

  const locate = async () => {
    setGpsBusy(true);
    setErr(null);
    try {
      const pt = await getGps();
      setGps(pt);
      const near = spots.map((l) => ({ l, d: km(pt, { lat: l.lat!, lng: l.lng! }) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= 5) setLoc(near.l.id);
    } catch (e) {
      setErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع — اختر المكان من القائمة", "Location permission denied — pick a spot from the list") : t("تعذر تحديد موقعك — اختر المكان من القائمة", "Couldn't get your location — pick a spot from the list"));
    } finally {
      setGpsBusy(false);
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const typed = fish.trim();
      let speciesId: string | null = null;
      if (typed) {
        const key = normalizeName(typed);
        const hit = ds.species.find((s) => speciesKeys(s).includes(key));
        if (hit) speciesId = hit.id;
        else {
          const ts = new Date().toISOString();
          const sp: Species = { id: uuid(), name_ar: typed, name_en: null, scientific_name: null, aliases: [], family: null, notes: null, cover_media_id: null, is_builtin: false, created_at: ts, updated_at: ts };
          await save("species", sp);
          speciesId = sp.id;
        }
      }
      const c = newCatch(active, {
        photo_media_id: photo,
        species_id: speciesId,
        identification_status: speciesId ? "manual" : "unidentified",
        location_id: loc,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        technique_id: active?.technique_id ?? null,
      });
      await save("catches", c);
      setOpen(false);
      const where = active ? active.title || (active.location_id && idx.locById.get(active.location_id)?.name) || t("الرحلة الجارية", "the active trip") : null;
      toast(
        active
          ? t(`حُفظت الصيدة في رحلة «${where}» وأُضيفت لإحصائياتك`, `Catch saved to trip “${where}” and counted in your stats`)
          : t("حُفظت الصيدة وأُضيفت لإحصائياتك (بدون رحلة)", "Catch saved and counted in your stats (no trip)"),
        { label: t("أكمل التفاصيل", "Add details"), href: `/catch/edit?id=${c.id}` },
      );
    } catch {
      setErr(t("تعذر الحفظ، جرّب مرة ثانية", "Couldn't save, try again"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("تسجيل سريع لصيدة", "Quick catch")}
        onClick={openSheet}
        className="no-print fixed end-4 bottom-[calc(var(--safe-bottom)+5rem)] z-40 grid size-14 place-items-center rounded-full bg-teal text-navy shadow-xl shadow-black/40 active:scale-95"
      >
        <span className="text-3xl leading-none" aria-hidden>📷</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("صيدة سريعة", "Quick catch")}>
        <div className="space-y-4">
          <div>
            {photo ? (
              <div className="relative">
                <Photo mediaId={photo} variant="full" className="aspect-[4/3] w-full rounded-xl" />
                <button type="button" aria-label="remove photo" onClick={() => setPhoto(null)} className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-5" />
                </button>
              </div>
            ) : (
              <Button type="button" size="lg" variant="secondary" loading={busy} onClick={() => cam.current?.click()} className="min-h-24 w-full flex-col">
                <Camera className="size-7" /> {t("صوّر السمكة", "Photograph the fish")}
              </Button>
            )}
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
          </div>

          <Field label={t("اسم السمكة", "Fish name")}>
            <Input value={fish} onChange={(e) => setFish(e.target.value)} list="quick-species" placeholder={t("مثلاً: بالول", "e.g. Balool")} autoComplete="off" />
            <datalist id="quick-species">
              {ds.species.map((s) => (
                <option key={s.id} value={s.name_ar} />
              ))}
            </datalist>
          </Field>
          <Select
            value={null}
            onChange={(id) => {
              const sp = id ? idx.speciesById.get(id) : null;
              if (sp) setFish(sp.name_ar);
            }}
            placeholder={t("أو اختر من قائمة الأنواع…", "Or pick from the species list…")}
            options={[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((x) => ({ value: x.id, label: name(x) }))}
          />
          {quick.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {quick.map((id) => {
                const s = idx.speciesById.get(id);
                if (!s) return null;
                const on = normalizeName(fish) === normalizeName(s.name_ar);
                return (
                  <button key={id} type="button" onClick={() => setFish(on ? "" : s.name_ar)} className={cn("min-h-10 rounded-full border px-3.5 text-sm", on ? "border-teal bg-teal/20 text-teal" : "border-line bg-surface-2")}>
                    {name(s)}
                  </button>
                );
              })}
            </div>
          )}

          <Field label={t("الموقع", "Location")}>
            <div className="space-y-2">
              <Button type="button" variant="secondary" loading={gpsBusy} onClick={locate} className="w-full">
                <LocateFixed className="size-5" /> {gps ? t("✓ تم تحديد موقعي الحالي — تحديث", "✓ Current location set — refresh") : t("استخدم موقعي الحالي (GPS)", "Use my current location (GPS)")}
              </Button>
              <Select value={loc} onChange={setLoc} placeholder={t("أو اختر المكان من القائمة", "Or pick a spot from the list")} options={spots.map((l) => ({ value: l.id, label: lang === "ar" ? l.name : l.name_en || l.name }))} />
            </div>
          </Field>

          <Notice tone="info">
            {active
              ? t(`ستُضاف إلى رحلتك الجارية، وتُحسب في إحصائياتك.`, "It will be added to your active trip and counted in your stats.")
              : t("ما عندك رحلة جارية — تُحفظ كصيدة بدون رحلة وتُحسب في إحصائياتك، وتقدر تربطها برحلة بعدين.", "No active trip — saved as a stand-alone catch, counted in your stats; link it to a trip later.")}
          </Notice>
          {err && <Notice tone="bad">{err}</Notice>}
          <Button size="lg" className="w-full" loading={saving} onClick={doSave}>
            {saving ? <Loader2 className="size-5 animate-spin" /> : null} {t("حفظ الصيدة", "Save catch")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
