"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CatchRow, TripCard } from "@/components/common";
import { Card, Input, PageHeader, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/normalize";

export default function SearchPage() {
  const { ds } = useStore();
  const { t, name } = useI18n();
  const [q, setQ] = useState("");

  const res = useMemo(() => {
    if (q.trim().length < 2) return null;
    const species = ds.species.filter((s) => matches(q, s.name_ar, s.name_en, s.scientific_name, ...s.aliases));
    const spIds = new Set(species.map((s) => s.id));
    const spots = ds.locations.filter((l) => matches(q, l.name, l.area, l.notes));
    const spotIds = new Set(spots.map((l) => l.id));
    const trips = ds.trips
      .filter(
        (tr) =>
          matches(q, tr.title, tr.notes, tr.lure_bait, tr.gear_notes, tr.weather) ||
          (tr.location_id && spotIds.has(tr.location_id)) ||
          (tr.target_species_id && spIds.has(tr.target_species_id)),
      )
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const catches = ds.catches
      .filter((c) => matches(q, c.notes, c.lure_bait, c.line_type) || (c.species_id && spIds.has(c.species_id)))
      .sort((a, b) => b.caught_at.localeCompare(a.caught_at));
    const gear = ds.equipment.filter((e) => matches(q, e.name, e.brand, e.model, e.specs, e.notes));
    return { species, spots, trips, catches, gear };
  }, [q, ds]);

  return (
    <>
      <PageHeader title={t("بحث", "Search")} back="/trips" />
      <Input autoFocus placeholder={t("أنواع، رحلات، ملاحظات، مواقع، معدات…", "Species, trips, notes, spots, gear…")} value={q} onChange={(e) => setQ(e.target.value)} />
      {res && (
        <>
          {res.species.length > 0 && (
            <>
              <SectionTitle>{t("الأنواع", "Species")}</SectionTitle>
              <Card className="divide-y divide-line/40 p-0">
                {res.species.map((s) => (
                  <Link key={s.id} href={`/species?id=${s.id}`} className="flex justify-between px-4 py-3 hover:bg-surface-2">
                    <span>{name(s)}</span>
                    <span className="text-sm text-muted">×{ds.catches.filter((c) => c.species_id === s.id).length}</span>
                  </Link>
                ))}
              </Card>
            </>
          )}
          {res.spots.length > 0 && (
            <>
              <SectionTitle>{t("المواقع", "Spots")}</SectionTitle>
              <Card className="divide-y divide-line/40 p-0">
                {res.spots.map((l) => (
                  <Link key={l.id} href="/spots" className="block px-4 py-3 hover:bg-surface-2">
                    {l.name}
                  </Link>
                ))}
              </Card>
            </>
          )}
          {res.trips.length > 0 && (
            <>
              <SectionTitle>{t(`الرحلات (${res.trips.length})`, `Trips (${res.trips.length})`)}</SectionTitle>
              <div className="space-y-2">
                {res.trips.slice(0, 30).map((tr) => (
                  <TripCard key={tr.id} trip={tr} />
                ))}
              </div>
            </>
          )}
          {res.catches.length > 0 && (
            <>
              <SectionTitle>{t(`الصيد (${res.catches.length})`, `Catches (${res.catches.length})`)}</SectionTitle>
              <Card className="p-2">
                {res.catches.slice(0, 50).map((c) => (
                  <CatchRow key={c.id} c={c} showTrip />
                ))}
              </Card>
            </>
          )}
          {res.gear.length > 0 && (
            <>
              <SectionTitle>{t("المعدات", "Gear")}</SectionTitle>
              <Card className="divide-y divide-line/40 p-0">
                {res.gear.map((e) => (
                  <Link key={e.id} href="/equipment" className="block px-4 py-3 hover:bg-surface-2">
                    {e.name}
                  </Link>
                ))}
              </Card>
            </>
          )}
          {!res.species.length && !res.spots.length && !res.trips.length && !res.catches.length && !res.gear.length && (
            <p className="mt-6 text-center text-muted">{t("لا توجد نتائج", "No results")}</p>
          )}
        </>
      )}
    </>
  );
}
