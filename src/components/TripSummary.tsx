"use client";

// Trip completion summary — built from the saved trip, its catches and its
// environmental snapshot. Neutral wording for trips without a catch.

import { useState } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { TIDE_LABEL, useI18n } from "@/lib/i18n";
import { tripEnv } from "@/lib/marine/env";
import { compass, fmtWind, readWindUnit } from "@/lib/marine/units";
import { targetsOf } from "@/lib/trips";
import { tripHours } from "@/lib/time";
import type { Trip } from "@/lib/types";
import { Badge, Button, Card, Field, Textarea } from "./ui";
import { fmtDepthRange, useDepthUnit } from "@/lib/depth";

export function TripSummary({ trip }: { trip: Trip }) {
  const { ds, idx, save } = useStore();
  const { t, lang, name, num } = useI18n();
  const du = useDepthUnit();
  const [worked, setWorked] = useState(trip.what_worked ?? "");
  const [next, setNext] = useState(trip.next_time ?? "");
  const [saved, setSaved] = useState(false);
  const catches = idx.catchesByTrip.get(trip.id) ?? [];
  const targets = targetsOf(ds, trip);
  const hit = targets.filter((s) => catches.some((c) => c.species_id === s));
  const hrs = tripHours(trip);
  const loc = trip.location_id ? idx.locById.get(trip.location_id) : null;
  const tech = trip.technique_id ? idx.techById.get(trip.technique_id) : null;
  const species = [...new Set(catches.map((c) => c.species_id))];
  const depths = catches.map((c) => c.depth_m).filter((d): d is number => d != null);
  const best = [...catches].filter((c) => c.weight_kg != null && !c.weight_is_estimate).sort((a, b) => b.weight_kg! - a.weight_kg!)[0];
  const env = tripEnv(ds, trip);
  const unit = readWindUnit();
  const lure = [trip.lure_type, trip.lure_weight_g ? `${trip.lure_weight_g} ${t("غ", "g")}` : null, trip.lure_color].filter(Boolean).join(" · ");

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-end">{v}</span>
    </div>
  );

  return (
    <Card className="space-y-2 border-teal/30">
      <div className="flex items-center gap-2 font-semibold">
        {catches.length ? <CheckCircle2 className="size-5 text-good" /> : <CircleDashed className="size-5 text-muted" />}
        {t("ملخص الرحلة", "Trip summary")}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">
        {catches.length
          ? t(`انتهت الرحلة بـ ${catches.length} صيدة من ${species.filter(Boolean).length || 1} نوع.`, `The trip ended with ${catches.length} catches of ${species.filter(Boolean).length || 1} species.`)
          : t("انتهت الرحلة بدون صيد. سُجّلت كما هي وستُفيد في مقارناتك القادمة.", "The trip ended without a catch. It's kept as is and helps your future comparisons.")}
        {targets.length > 0 &&
          (hit.length
            ? t(` تم صيد المستهدف: ${hit.map((s) => name(idx.speciesById.get(s))).join("، ")}.`, ` Target caught: ${hit.map((s) => name(idx.speciesById.get(s))).join(", ")}.`)
            : t(" لم يُصد النوع المستهدف هذه المرة.", " The target species wasn't caught this time."))}
      </p>
      <div className="divide-y divide-line/40">
        <Row k={t("المدة", "Duration")} v={hrs != null ? `${num(hrs)} ${t("ساعة", "h")}` : "—"} />
        <Row k={t("المستهدف", "Target")} v={targets.length ? targets.map((s) => name(idx.speciesById.get(s))).join("، ") : "—"} />
        <Row k={t("الموقع", "Spot")} v={loc?.name ?? "—"} />
        <Row k={t("الطريقة", "Technique")} v={tech ? name(tech) : "—"} />
        <Row
          k={t("العمق: مخطط / فعلي", "Depth: planned / actual")}
          v={(() => {
            const planned = fmtDepthRange(trip.target_depth_m, trip.target_depth_max_m, du, lang);
            const actual = depths.length ? fmtDepthRange(Math.min(...depths), Math.max(...depths), du, lang) : "—";
            return (
              <>
                <bdi>{planned}</bdi> / <bdi>{actual}</bdi>
              </>
            );
          })()}
        />
        {lure && <Row k={t("الطُعم / الجك", "Lure / jig")} v={lure} />}
        <Row k={t("الأنواع", "Species")} v={species.length ? species.map((s) => (s ? name(idx.speciesById.get(s)) : t("غير محدد", "unidentified"))).join("، ") : "—"} />
        {best && <Row k={t("أفضل صيدة مقاسة", "Best measured catch")} v={`${best.weight_kg} ${t("كغ", "kg")} · ${name(best.species_id ? idx.speciesById.get(best.species_id) : null)}`} />}
        {(env.tidePhase || env.wind || env.wave) && (
          <Row
            k={t("الظروف عند البداية", "Conditions at start")}
            v={[
              env.tidePhase ? TIDE_LABEL[env.tidePhase.value][lang] : null,
              env.wind ? `${compass(env.windDir?.value, lang)} ${fmtWind(env.wind.value, unit, lang)}` : null,
              env.wave ? `${env.wave.value} ${t("م موج", "m waves")}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
      </div>
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((s) => (
            <Badge key={s} tone={hit.includes(s) ? "good" : "default"}>
              {hit.includes(s) ? "✓" : "✗"} {name(idx.speciesById.get(s))}
            </Badge>
          ))}
        </div>
      )}
      <Field label={t("ما الذي نجح؟", "What worked?")}>
        <Textarea rows={2} value={worked} onChange={(e) => setWorked(e.target.value)} />
      </Field>
      <Field label={t("ماذا أغيّر المرة القادمة؟", "What to change next time?")}>
        <Textarea rows={2} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await save("trips", { ...trip, what_worked: worked.trim() || null, next_time: next.trim() || null });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? t("✓ حُفظ", "✓ Saved") : t("حفظ الملاحظات", "Save notes")}
      </Button>
    </Card>
  );
}
