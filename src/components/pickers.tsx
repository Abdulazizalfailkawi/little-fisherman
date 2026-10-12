"use client";

import { useMemo, useState } from "react";
import { Check, LocateFixed, MapPin, Plus, Search } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { uuid } from "@/lib/ids";
import { EQUIP_LABEL, label, useI18n } from "@/lib/i18n";
import { matches, normalizeName, speciesKeys } from "@/lib/normalize";
import { EQUIPMENT_CATEGORIES, type Location, type Species } from "@/lib/types";
import { Button, Choice, Field, Input, Notice, Sheet, cn } from "./ui";

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------
export function findSpeciesDuplicate(all: Species[], name_ar: string, name_en: string | null, excludeId?: string): Species | null {
  const keys = [normalizeName(name_ar), normalizeName(name_en)].filter(Boolean);
  return all.find((s) => s.id !== excludeId && speciesKeys(s).some((k) => keys.includes(k))) ?? null;
}

export function SpeciesPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const { ds, idx } = useStore();
  const { t, name } = useI18n();
  const [open, setOpen] = useState(false);
  const cur = value ? idx.speciesById.get(value) : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-start"
      >
        <span className={cn("truncate", !cur && "text-muted")}>
          {cur ? (
            <>
              {name(cur)} <span className="text-xs text-muted">{t(cur.name_en ?? "", cur.name_ar)}</span>
            </>
          ) : (
            placeholder ?? t("اختر النوع", "Choose species")
          )}
        </span>
        <Search className="size-4 shrink-0 text-muted" />
      </button>
      <SpeciesSheet
        open={open}
        onClose={() => setOpen(false)}
        species={ds.species}
        onPick={(id) => {
          onChange(id);
          setOpen(false);
        }}
        allowClear={!!value}
      />
    </>
  );
}

export function SpeciesSheet({
  open,
  onClose,
  onPick,
  species,
  allowClear,
  initialQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string | null) => void;
  species: Species[];
  allowClear?: boolean;
  initialQuery?: string;
}) {
  const { t, name } = useI18n();
  const [q, setQ] = useState(initialQuery);
  const [adding, setAdding] = useState(false);
  const list = useMemo(
    () =>
      species
        .filter((s) => matches(q, s.name_ar, s.name_en, s.scientific_name, ...s.aliases))
        .sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")),
    [species, q],
  );
  return (
    <Sheet open={open} onClose={onClose} title={t("نوع السمكة", "Species")}>
      {adding ? (
        <NewSpeciesForm
          initialName={q}
          onDone={(id) => {
            setAdding(false);
            if (id) onPick(id);
          }}
        />
      ) : (
        <>
          <Input autoFocus placeholder={t("ابحث بالعربي أو الإنجليزي…", "Search Arabic or English…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[50dvh] space-y-1 overflow-y-auto">
            {allowClear && (
              <button onClick={() => onPick(null)} className="w-full rounded-xl px-3 py-3 text-start text-muted hover:bg-surface-2">
                {t("— غير محدد —", "— Unidentified —")}
              </button>
            )}
            {list.map((s) => (
              <button key={s.id} onClick={() => onPick(s.id)} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-start hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name(s)}</span>
                  <span className="block truncate text-xs text-muted">
                    {t(s.name_en ?? "", s.name_ar)} {s.scientific_name && <i>· {s.scientific_name}</i>}
                  </span>
                </span>
              </button>
            ))}
            {list.length === 0 && <p className="px-3 py-4 text-sm text-muted">{t("لا يوجد نوع مطابق", "No matching species")}</p>}
          </div>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t("إضافة نوع جديد", "Add new species")}
          </Button>
        </>
      )}
    </Sheet>
  );
}

export function NewSpeciesForm({
  initialName = "",
  initial,
  onDone,
}: {
  initialName?: string;
  initial?: Partial<Species>;
  onDone: (id: string | null) => void;
}) {
  const { ds, save } = useStore();
  const { t, name } = useI18n();
  const isArabic = /[؀-ۿ]/.test(initialName);
  const [ar, setAr] = useState(initial?.name_ar ?? (isArabic ? initialName : ""));
  const [en, setEn] = useState(initial?.name_en ?? (!isArabic ? initialName : ""));
  const [sci, setSci] = useState(initial?.scientific_name ?? "");
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join("، "));
  const [err, setErr] = useState<string | null>(null);
  const dup = ar.trim() ? findSpeciesDuplicate(ds.species, ar, en || null, initial?.id) : null;

  const submit = async () => {
    if (!ar.trim()) return setErr(t("الاسم العربي مطلوب", "Arabic name is required"));
    if (dup) return;
    const ts = new Date().toISOString();
    const existing = initial?.id ? ds.species.find((s) => s.id === initial.id) : null;
    const row: Species = {
      id: existing?.id ?? uuid(),
      name_ar: ar.trim(),
      name_en: en.trim() || null,
      scientific_name: sci.trim() || null,
      aliases: aliases
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean),
      family: existing?.family ?? null,
      notes: existing?.notes ?? null,
      cover_media_id: existing?.cover_media_id ?? null,
      is_builtin: existing?.is_builtin ?? false,
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    };
    await save("species", row);
    onDone(row.id);
  };

  return (
    <div className="space-y-3">
      <Field label={t("الاسم العربي *", "Arabic name *")} error={err}>
        <Input value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" />
      </Field>
      <Field label={t("الاسم الإنجليزي", "English name")}>
        <Input value={en} onChange={(e) => setEn(e.target.value)} dir="ltr" />
      </Field>
      <Field label={t("الاسم العلمي (اختياري)", "Scientific name (optional)")}>
        <Input value={sci} onChange={(e) => setSci(e.target.value)} dir="ltr" className="italic" />
      </Field>
      <Field label={t("أسماء أخرى / تهجئات", "Other names / spellings")} hint={t("افصل بينها بفاصلة", "Separate with commas")}>
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </Field>
      {dup && (
        <Notice tone="warn">
          {t("هذا النوع موجود مسبقاً:", "This species already exists:")} <b>{name(dup)}</b>
          <Button size="sm" variant="secondary" className="ms-2" onClick={() => onDone(dup.id)}>
            {t("استخدمه", "Use it")}
          </Button>
        </Notice>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={!!dup}>
          <Check className="size-4" /> {t("حفظ", "Save")}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t("إلغاء", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------
export function getGps(): Promise<{ lat: number; lng: number }> {
  return new Promise((res, rej) => {
    if (!("geolocation" in navigator)) return rej(new Error("NO_GPS"));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }),
      (e) => rej(new Error(e.code === 1 ? "DENIED" : "UNAVAILABLE")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export function LocationPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { ds } = useStore();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const locs = [...ds.locations].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return (
    <>
      <div className="flex gap-2">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="min-h-12 w-full flex-1 appearance-none rounded-xl border border-line bg-surface-2 px-3.5 text-ink focus:border-teal focus:outline-none"
        >
          <option value="">{t("— اختر موقع الصيد —", "— Choose a spot —")}</option>
          {locs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.area ? ` · ${l.area}` : ""}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)} aria-label={t("موقع جديد", "New spot")}>
          <Plus className="size-5" />
        </Button>
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t("موقع صيد جديد", "New fishing spot")}>
        <LocationForm
          onDone={(id) => {
            setAdding(false);
            if (id) onChange(id);
          }}
        />
      </Sheet>
    </>
  );
}

export function LocationForm({ initial, onDone }: { initial?: Location; onDone: (id: string | null) => void }) {
  const { ds, save } = useStore();
  const { t } = useI18n();
  const [nameV, setName] = useState(initial?.name ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [kind, setKind] = useState<Location["kind"]>(initial?.kind ?? "boat");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(initial?.lat != null ? { lat: initial.lat, lng: initial.lng! } : null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const dup = ds.locations.find((l) => l.id !== initial?.id && normalizeName(l.name) === normalizeName(nameV));

  const submit = async () => {
    if (!nameV.trim() || dup) return;
    const ts = new Date().toISOString();
    const row: Location = {
      id: initial?.id ?? uuid(),
      name: nameV.trim(),
      area: area.trim() || null,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      kind,
      notes: initial?.notes ?? null,
      is_demo: initial?.is_demo ?? false,
      created_at: initial?.created_at ?? ts,
      updated_at: ts,
    };
    await save("locations", row);
    onDone(row.id);
  };

  return (
    <div className="space-y-3">
      <Field label={t("اسم الموقع *", "Spot name *")} error={dup ? t("الاسم مستخدم مسبقاً", "Name already used") : null}>
        <Input value={nameV} onChange={(e) => setName(e.target.value)} placeholder={t("مثال: ساحل الفنطاس", "e.g. Al-Fintas coast")} />
      </Field>
      <Field label={t("المنطقة", "Area")}>
        <Input value={area} onChange={(e) => setArea(e.target.value)} />
      </Field>
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
      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-ink-2">
            <MapPin className="size-4" />
            {gps ? <span className="ltr">{gps.lat}, {gps.lng}</span> : t("بدون إحداثيات", "No coordinates")}
          </span>
          <div className="flex gap-1">
            {gps && (
              <Button size="sm" variant="ghost" onClick={() => setGps(null)}>
                {t("إزالة", "Remove")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              loading={locating}
              onClick={async () => {
                setGpsErr(null);
                setLocating(true);
                try {
                  setGps(await getGps());
                } catch (e) {
                  setGpsErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع", "Location permission denied") : t("تعذر تحديد الموقع", "Couldn't get location"));
                } finally {
                  setLocating(false);
                }
              }}
            >
              <LocateFixed className="size-4" /> {t("موقعي الحالي", "Use GPS")}
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          {gpsErr ?? t("اختياري — يُطلب الإذن فقط عند الضغط.", "Optional — permission is only requested when you tap.")}
        </p>
      </div>
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

// ---------------------------------------------------------------------------
// Equipment (multi-select)
// ---------------------------------------------------------------------------
export function EquipmentPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { ds } = useStore();
  const { t, lang } = useI18n();
  const active = ds.equipment.filter((e) => !e.retired || value.includes(e.id));
  if (!active.length)
    return (
      <p className="text-sm text-muted">
        {t("لا توجد معدات مسجلة بعد — أضفها من صفحة المعدات.", "No gear recorded yet — add it on the Equipment page.")}
      </p>
    );
  return (
    <div className="space-y-2">
      {EQUIPMENT_CATEGORIES.filter((c) => active.some((e) => e.category === c)).map((c) => (
        <div key={c}>
          <div className="mb-1 text-xs text-muted">{label(EQUIP_LABEL, c, lang)}</div>
          <div className="flex flex-wrap gap-2">
            {active
              .filter((e) => e.category === c)
              .map((e) => {
                const on = value.includes(e.id);
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onChange(on ? value.filter((x) => x !== e.id) : [...value, e.id])}
                    className={cn(
                      "min-h-10 rounded-xl border px-3 text-sm",
                      on ? "border-teal bg-teal/15 text-teal" : "border-line bg-surface-2 text-ink-2",
                    )}
                  >
                    {on && <Check className="me-1 inline size-3.5" />}
                    {e.name}
                    {e.pe_rating ? ` · PE${e.pe_rating}` : ""}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
