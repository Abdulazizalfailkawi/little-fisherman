"use client";

import Link from "next/link";
import { CloudOff, Fish, ImageIcon, Moon, PlayCircle } from "lucide-react";
import { MOON_EMOJI, effectiveMoonPhase } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { fmtHijri, toHijri, tripHijri } from "@/lib/hijri";
import { MOON_LABEL, TIDE_LABEL, label, useI18n } from "@/lib/i18n";
import { fmtDate, fmtTime, tripHours } from "@/lib/time";
import type { Catch, Trip } from "@/lib/types";
import { elapsed, statusOf, targetsOf } from "@/lib/trips";
import { useMediaUrl } from "@/lib/useMedia";
import { Badge, cn } from "./ui";

export function Photo({
  mediaId,
  variant = "thumb",
  className,
  alt = "",
  fallback,
}: {
  mediaId: string | null | undefined;
  variant?: "thumb" | "full";
  className?: string;
  alt?: string;
  fallback?: React.ReactNode;
}) {
  const url = useMediaUrl(mediaId, variant);
  const { ds } = useStore();
  const isVideo = mediaId ? ds.media.find((m) => m.id === mediaId)?.kind === "video" : false;
  if (isVideo) {
    return url && variant === "full" ? (
      <video src={url} controls playsInline className={cn("bg-black object-contain", className)} />
    ) : (
      <div className={cn("grid place-items-center bg-surface-3 text-ink-2", className)}>
        <PlayCircle className="size-8" />
      </div>
    );
  }
  if (!mediaId || !url)
    return (
      <div className={cn("grid place-items-center bg-surface-2 text-muted", className)}>
        {fallback ?? (mediaId ? <ImageIcon className="size-6 opacity-50" /> : <Fish className="size-7 opacity-40" />)}
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />;
}

/** Gregorian + Hijri date line, with correction marker. */
export function DualDate({ iso, override, className }: { iso: string; override?: string | null; className?: string }) {
  const { lang, t } = useI18n();
  const { hijriOffset } = useStore();
  const h = override !== undefined ? tripHijri({ started_at: iso, hijri_date_override: override }, hijriOffset) : { date: toHijri(iso, hijriOffset), corrected: false };
  return (
    <span className={className}>
      {fmtDate(iso, lang, { weekday: "short" })}
      <span className="text-muted"> · {fmtHijri(h.date, lang)}</span>
      {h.corrected && <span className="text-warn"> ({t("مصحح", "corrected")})</span>}
    </span>
  );
}

export function TripCard({ trip }: { trip: Trip }) {
  const { ds, idx, isPending } = useStore();
  const { lang, t, name, num } = useI18n();
  const catches = idx.catchesByTrip.get(trip.id) ?? [];
  const loc = trip.location_id ? idx.locById.get(trip.location_id) : null;
  const tech = trip.technique_id ? idx.techById.get(trip.technique_id) : null;
  const h = tripHours(trip);
  const photo = catches.find((c) => c.photo_media_id)?.photo_media_id;
  const species = [...new Set(catches.map((c) => c.species_id))].slice(0, 3);
  const pending = isPending("trips", trip.id) || catches.some((c) => isPending("catches", c.id));
  const st = statusOf(trip);
  const targets = targetsOf(ds, trip);
  return (
    <Link href={`/trip?id=${trip.id}`} className="print-card flex gap-3 rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-3 transition-colors hover:bg-surface-2">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl">
        <Photo mediaId={photo} className="size-full" fallback={<span className="text-3xl">{catches.length ? "🐟" : "🌊"}</span>} />
        <span
          className={cn(
            "absolute bottom-1 start-1 rounded-md px-1.5 text-xs font-bold",
            catches.length ? "bg-good text-abyss" : "bg-surface-3 text-ink-2",
          )}
        >
          {catches.length}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{trip.title || loc?.name || t("رحلة صيد", "Fishing trip")}</h3>
          {st !== "completed" && (
            <Badge tone={st === "active" ? "warn" : st === "planned" ? "ocean" : "bad"}>
              {{ planned: t("مخططة", "Planned"), active: t("جارية", "Active"), cancelled: t("ملغاة", "Cancelled"), completed: "" }[st]}
            </Badge>
          )}
          {pending && <CloudOff className="size-4 shrink-0 text-warn" aria-label="not synced" />}
        </div>
        <DualDate iso={trip.started_at} override={trip.hijri_date_override} className="mt-0.5 block truncate text-xs text-ink-2" />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {tech && <Badge tone="ocean">{name(tech)}</Badge>}
          {catches.length === 0 && st === "completed" && <Badge>{t("بدون صيد", "No catch")}</Badge>}
          {targets.map((s) => (
            <Badge key={s} tone="teal">
              🎯 {name(idx.speciesById.get(s))}
            </Badge>
          ))}
          {trip.target_depth_m != null && (
            <span className="text-muted">
              {trip.target_depth_m}
              {trip.target_depth_max_m != null ? `–${trip.target_depth_max_m}` : ""} {t("م", "m")}
            </span>
          )}
          {st === "active" && <span className="text-warn">{elapsed(trip.started_at, Date.now(), lang)}</span>}
          {h != null && <span className="text-muted">{num(h)} {t("س", "h")}</span>}
          {species.map((s) => (
            <span key={s ?? "x"} className="text-muted">
              · {s ? name(idx.speciesById.get(s)) : t("غير محدد", "unidentified")}
            </span>
          ))}
        </div>
        <span className="sr-only">{fmtTime(trip.started_at, lang)}</span>
      </div>
    </Link>
  );
}

export function CatchRow({ c, showTrip }: { c: Catch; showTrip?: boolean }) {
  const { idx, isPending } = useStore();
  const { lang, t, name } = useI18n();
  const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
  const trip = idx.tripById.get(c.trip_id ?? "");
  return (
    <Link href={`/catch?id=${c.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-2">
      <Photo mediaId={c.photo_media_id} className="size-14 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{sp ? name(sp) : t("غير محدد", "Unidentified")}</span>
          {c.identification_status === "pending_ai" && <Badge tone="warn">{t("بانتظار AI", "AI pending")}</Badge>}
          {c.released && <Badge tone="teal">{t("أُطلق", "Released")}</Badge>}
          {isPending("catches", c.id) && <CloudOff className="size-3.5 text-warn" />}
        </div>
        <div className="truncate text-xs text-muted">
          {[
            showTrip ? fmtDate(c.caught_at, lang) : null,
            fmtTime(c.caught_at, lang),
            c.weight_kg != null ? `${c.weight_kg}${c.weight_is_estimate ? "≈" : ""} ${t("كغ", "kg")}` : null,
            c.length_cm != null ? `${c.length_cm}${c.length_is_estimate ? "≈" : ""} ${t("سم", "cm")}` : null,
            showTrip && trip?.title ? trip.title : null,
          ]
            .filter(Boolean)
            .map((x, i) => (
              <bdi key={i}>
                {i > 0 && " · "}
                {x}
              </bdi>
            ))}
        </div>
      </div>
    </Link>
  );
}

export function Conditions({ trip }: { trip: Trip }) {
  const { lang, t } = useI18n();
  const moon = effectiveMoonPhase(trip);
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <Badge>
        <Moon className="size-3" /> {MOON_EMOJI[moon.phase]} {label(MOON_LABEL, moon.phase, lang)}
        {moon.calculated && <span className="text-muted">({t("محسوب", "calc.")})</span>}
      </Badge>
      {trip.tide && <Badge>🌊 {label(TIDE_LABEL, trip.tide, lang)}</Badge>}
    </div>
  );
}

/** "Measured" vs "estimated" marker. */
export function MeasureTag({ estimate }: { estimate: boolean }) {
  const { t } = useI18n();
  return estimate ? <Badge tone="warn">{t("تقديري", "Estimated")}</Badge> : <Badge tone="good">{t("مقاس", "Measured")}</Badge>;
}
