"use client";

// "الأسماك في هذي الرحلة": add fish while creating / editing a trip. The fish
// are created as catches linked to the trip when the trip is saved.

import { useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import type { Trip } from "@/lib/types";
import { Photo } from "./common";
import { Button, Input, NumberInput, Select } from "./ui";

export interface PendingFish {
  key: string;
  name: string;
  weight: number | null;
  photo: string | null;
}

export function TripFishEditor({ trip, pending, setPending }: { trip: Trip; pending: PendingFish[]; setPending: (v: PendingFish[]) => void }) {
  const { ds, idx, addPhoto } = useStore();
  const { t, name } = useI18n();
  const cam = useRef<HTMLInputElement>(null);
  const [fish, setFish] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = ds.catches.filter((c) => c.trip_id === trip.id);

  const add = () => {
    if (!fish.trim() && !photo) return;
    setPending([...pending, { key: crypto.randomUUID(), name: fish.trim(), weight, photo }]);
    setFish("");
    setWeight(null);
    setPhoto(null);
  };

  return (
    <div className="space-y-2 border-t border-line/40 pt-4">
      <div className="font-semibold">
        🐟 {t("الأسماك في هذي الرحلة", "Fish on this trip")} <span className="text-ocean">({saved.length + pending.length})</span>
      </div>

      {saved.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          {c.photo_media_id ? <Photo mediaId={c.photo_media_id} className="size-11 rounded-lg" /> : <div className="grid size-11 place-items-center rounded-lg bg-white/5 text-[10px] text-muted">{t("بدون", "none")}</div>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{c.species_id ? name(idx.speciesById.get(c.species_id)) : t("غير محدد", "Unidentified")}</div>
            {c.weight_kg != null && (
              <div className="text-xs text-ink-2">
                {c.weight_kg} {t("كغ", "kg")}
              </div>
            )}
          </div>
        </div>
      ))}
      {pending.map((p) => (
        <div key={p.key} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          {p.photo ? <Photo mediaId={p.photo} className="size-11 rounded-lg" /> : <div className="grid size-11 place-items-center rounded-lg bg-white/5 text-[10px] text-muted">{t("بدون", "none")}</div>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{p.name || t("غير محدد", "Unidentified")}</div>
            <div className="text-xs text-ink-2">
              {p.weight != null ? `${p.weight} ${t("كغ", "kg")} · ` : ""}
              {t("تنحفظ مع الرحلة", "saved with the trip")}
            </div>
          </div>
          <button type="button" aria-label="remove" onClick={() => setPending(pending.filter((x) => x.key !== p.key))} className="grid size-9 place-items-center rounded-full text-bad">
            <X className="size-5" />
          </button>
        </div>
      ))}

      <div className="space-y-2 rounded-xl border border-dashed border-ocean/50 p-3">
        <div className="flex items-center gap-2">
          <Input className="flex-[2]" value={fish} onChange={(e) => setFish(e.target.value)} list="trip-fish-species" placeholder={t("نوع السمكة…", "Fish name…")} autoComplete="off" />
          <datalist id="trip-fish-species">
            {ds.species.map((s) => (
              <option key={s.id} value={s.name_ar} />
            ))}
          </datalist>
          <div className="flex-1">
            <NumberInput value={weight} onChange={setWeight} />
          </div>
          <button type="button" aria-label="photo" onClick={() => cam.current?.click()} className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-2">
            {photo ? <Photo mediaId={photo} className="size-10 rounded-lg" /> : <Camera className="size-5" />}
          </button>
          <input
            ref={cam}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                setPhoto((await addPhoto(f)).id);
              } catch {}
              setBusy(false);
              if (cam.current) cam.current.value = "";
            }}
          />
        </div>
        <Select
          value={null}
          onChange={(id) => {
            const sp = id ? idx.speciesById.get(id) : null;
            if (sp) setFish(sp.name_ar);
          }}
          placeholder={t("أو اختر من قائمة الأنواع…", "Or pick from the species list…")}
          options={[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((x) => ({ value: x.id, label: name(x) }))}
        />
        <Button type="button" className="w-full" loading={busy} onClick={add}>
          <Plus className="size-5" /> {t("إضافة سمكة", "Add fish")}
        </Button>
        <p className="text-[11px] text-muted">{t("الوزن بالكيلو (اختياري). تنحفظ السمكة لما تحفظ الرحلة.", "Weight in kg (optional). The fish is saved when you save the trip.")}</p>
      </div>
    </div>
  );
}
