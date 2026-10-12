"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/db/store";
import { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN } from "@/lib/hijri";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import type { Filters } from "@/lib/stats";
import { MOON_PHASES, TIDES, type MoonPhase, type Tide } from "@/lib/types";
import { Badge, Button, Field, Input, Select, Sheet } from "./ui";

/** Shared filter sheet for trips, calendar and analytics. */
export function FilterBar({
  value,
  onChange,
  fields = ["date", "species", "technique", "location", "hijri", "tide", "moon"],
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  fields?: ("date" | "species" | "technique" | "location" | "hijri" | "tide" | "moon")[];
}) {
  const { ds, idx } = useStore();
  const { t, lang, name } = useI18n();
  const [open, setOpen] = useState(false);
  const active = Object.entries(value).filter(([k, v]) => v != null && v !== "" && k !== "q");
  const set = (k: keyof Filters, v: unknown) => onChange({ ...value, [k]: v || undefined });

  const chips: string[] = [];
  if (value.from || value.to) chips.push(`${value.from ?? "…"} → ${value.to ?? "…"}`);
  if (value.speciesId) chips.push(name(idx.speciesById.get(value.speciesId)));
  if (value.techniqueId) chips.push(name(idx.techById.get(value.techniqueId)));
  if (value.locationId) chips.push(idx.locById.get(value.locationId)?.name ?? "");
  if (value.hijriMonth) chips.push((lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN)[value.hijriMonth - 1]);
  if (value.tide) chips.push(TIDE_LABEL[value.tide][lang]);
  if (value.moon) chips.push(MOON_LABEL[value.moon][lang]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={active.length ? "teal" : "secondary"} onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" /> {t("تصفية", "Filter")}
          {active.length > 0 && ` (${active.length})`}
        </Button>
        {chips.map((c) => (
          <Badge key={c} tone="teal">
            {c}
          </Badge>
        ))}
        {active.length > 0 && (
          <button className="text-xs text-muted underline" onClick={() => onChange({ q: value.q })}>
            {t("مسح", "Clear")}
          </button>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("تصفية", "Filters")}>
        <div className="space-y-3">
          {fields.includes("date") && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("من", "From")}>
                <Input type="date" value={value.from ?? ""} onChange={(e) => set("from", e.target.value)} />
              </Field>
              <Field label={t("إلى", "To")}>
                <Input type="date" value={value.to ?? ""} onChange={(e) => set("to", e.target.value)} />
              </Field>
            </div>
          )}
          {fields.includes("hijri") && (
            <Field label={t("الشهر الهجري", "Hijri month")}>
              <Select
                value={value.hijriMonth ? String(value.hijriMonth) : null}
                onChange={(v) => set("hijriMonth", v ? Number(v) : undefined)}
                options={(lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN).map((m, i) => ({ value: String(i + 1), label: m }))}
                placeholder={t("الكل", "All")}
              />
            </Field>
          )}
          {fields.includes("species") && (
            <Field label={t("النوع", "Species")}>
              <Select
                value={value.speciesId}
                onChange={(v) => set("speciesId", v)}
                placeholder={t("الكل", "All")}
                options={[...ds.species].sort((a, b) => name(a).localeCompare(name(b))).map((s) => ({ value: s.id, label: name(s) }))}
              />
            </Field>
          )}
          {fields.includes("technique") && (
            <Field label={t("الطريقة", "Technique")}>
              <Select value={value.techniqueId} onChange={(v) => set("techniqueId", v)} placeholder={t("الكل", "All")} options={ds.techniques.map((x) => ({ value: x.id, label: name(x) }))} />
            </Field>
          )}
          {fields.includes("location") && (
            <Field label={t("الموقع", "Spot")}>
              <Select value={value.locationId} onChange={(v) => set("locationId", v)} placeholder={t("الكل", "All")} options={ds.locations.map((l) => ({ value: l.id, label: l.name }))} />
            </Field>
          )}
          {fields.includes("tide") && (
            <Field label={t("المد والجزر (المسجل فقط)", "Tide (recorded only)")}>
              <Select value={value.tide} onChange={(v) => set("tide", v as Tide)} placeholder={t("الكل", "All")} options={TIDES.map((x) => ({ value: x, label: TIDE_LABEL[x][lang] }))} />
            </Field>
          )}
          {fields.includes("moon") && (
            <Field label={t("طور القمر", "Moon phase")}>
              <Select value={value.moon} onChange={(v) => set("moon", v as MoonPhase)} placeholder={t("الكل", "All")} options={MOON_PHASES.map((x) => ({ value: x, label: MOON_LABEL[x][lang] }))} />
            </Field>
          )}
          <Button className="w-full" onClick={() => setOpen(false)}>
            {t("تطبيق", "Apply")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
