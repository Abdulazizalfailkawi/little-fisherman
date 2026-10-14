"use client";

// New community post: photo + note + fish + (optional) weight, and — chosen per
// post — whether a place name is shown. GPS never leaves the device.

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { createPost } from "@/lib/community";
import { useI18n } from "@/lib/i18n";
import { Button, Field, Input, NumberInput, Notice, Select, Sheet, Textarea } from "./ui";

export interface ComposerPrefill {
  photo?: Blob | null;
  species?: string;
  weight?: number | null;
  catchId?: string | null;
}

export function CommunityComposer({ open, onClose, onPosted, prefill }: { open: boolean; onClose: () => void; onPosted?: () => void; prefill?: ComposerPrefill }) {
  const { ds, idx, user } = useStore();
  const { t, name, lang } = useI18n();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fishId, setFishId] = useState<string | null>(null);
  const [fishNew, setFishNew] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto(prefill?.photo ?? null);
    setWeight(prefill?.weight ?? null);
    setBody("");
    setPlace(null);
    setErr(null);
    const sp = prefill?.species ? ds.species.find((x) => x.name_ar === prefill.species) : null;
    setFishId(sp ? sp.id : prefill?.species ? "__new" : null);
    setFishNew(sp ? "" : prefill?.species ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const species = fishId === "__new" ? fishNew.trim() : fishId ? idx.speciesById.get(fishId)?.name_ar ?? "" : "";
  const spots = ds.locations.filter((l) => l.lat != null).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const send = async () => {
    if (!user) return;
    if (!photo) return setErr(t("أضف صورة السمكة أول", "Add the fish photo first"));
    setBusy(true);
    setErr(null);
    try {
      await createPost(user.id, { photo, body, species, weight, place, catchId: prefill?.catchId ?? null });
      onPosted?.();
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === "DAILY_LIMIT" ? t("وصلت الحد اليومي للنشر (٢٠ منشور). جرّب باجر.", "Daily post limit reached (20). Try tomorrow.") : m === "OFFLINE" || !navigator.onLine ? t("ما فيه إنترنت — جرّب لما يرجع الاتصال", "You're offline — try again when you're back online") : t("تعذر النشر، جرّب مرة ثانية", "Couldn't post, try again"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("منشور جديد في المجتمع", "New community post")}>
      <div className="space-y-4">
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
            <button type="button" aria-label="remove photo" onClick={() => setPhoto(null)} className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white">
              <X className="size-5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" className="min-h-20 flex-col" onClick={() => cam.current?.click()}>
              <Camera className="size-6" /> {t("صوّر", "Camera")}
            </Button>
            <Button type="button" variant="secondary" className="min-h-20 flex-col" onClick={() => lib.current?.click()}>
              <ImagePlus className="size-6" /> {t("من الاستوديو", "From gallery")}
            </Button>
          </div>
        )}
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />

        <Field label={t("نوع السمكة", "Fish")}>
          <div className="space-y-2">
            <Select
              value={fishId}
              onChange={setFishId}
              placeholder={t("اختر من القائمة… (اختياري)", "Pick from the list… (optional)")}
              options={[
                ...[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((x) => ({ value: x.id, label: name(x) })),
                { value: "__new", label: t("＋ نوع ثاني (اكتب الاسم)", "+ Another fish (type the name)") },
              ]}
            />
            {fishId === "__new" && <Input value={fishNew} maxLength={60} onChange={(e) => setFishNew(e.target.value)} placeholder={t("اكتب اسم السمكة", "Type the fish name")} />}
          </div>
        </Field>
        <Field label={t("الوزن بالكيلو (اختياري)", "Weight in kg (optional)")}>
          <NumberInput value={weight} onChange={setWeight} />
        </Field>
        <Field label={t("التعليق", "Caption")} hint={`${body.length}/500`}>
          <Textarea value={body} rows={3} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder={t("اكتب شيء عن الصيدة… (اختياري)", "Say something about the catch… (optional)")} />
        </Field>
        <Field label={t("المكان", "Place")} hint={t("أنت تقرر: يظهر الاسم فقط، ولا تُنشر إحداثيات GPS أبداً.", "Your call: only the name is shown; GPS coordinates are never published.")}>
          <Select value={place} onChange={setPlace} placeholder={t("بدون مكان (الافتراضي)", "No place (default)")} options={spots.map((l) => ({ value: lang === "ar" ? l.name : l.name_en || l.name, label: lang === "ar" ? l.name : l.name_en || l.name }))} />
        </Field>

        <Notice tone="info">{t("منشورك يشوفه كل مسجّلي سجي. الصورة تُنشر بدون بيانات الموقع المخفية فيها.", "All signed-in SAJJI users can see your post. Hidden location data in the photo is removed.")}</Notice>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button size="lg" className="w-full" loading={busy} onClick={send}>
          {t("نشر", "Post")}
        </Button>
      </div>
    </Sheet>
  );
}
