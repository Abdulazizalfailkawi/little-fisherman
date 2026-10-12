"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Photo } from "@/components/common";
import { Badge, Button, Card, Empty, Field, Input, NumberInput, PageHeader, SectionTitle, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { uuid } from "@/lib/ids";
import { EQUIP_LABEL, label, useI18n } from "@/lib/i18n";
import { EQUIPMENT_CATEGORIES, type Equipment, type EquipmentCategory } from "@/lib/types";

export default function EquipmentPage() {
  const { ds } = useStore();
  const { t, lang } = useI18n();
  const [edit, setEdit] = useState<Equipment | "new" | null>(null);

  const usage = (id: string) => {
    const trips = new Set(ds.trip_equipment.filter((x) => x.equipment_id === id).map((x) => x.trip_id));
    const direct = new Set(ds.catch_equipment.filter((x) => x.equipment_id === id).map((x) => x.catch_id));
    const fish = ds.catches.filter((c) => trips.has(c.trip_id) || direct.has(c.id)).length;
    return { trips: trips.size, fish };
  };

  return (
    <>
      <PageHeader
        title={t("المعدات", "Equipment")}
        back="/more"
        actions={
          <Button size="sm" onClick={() => setEdit("new")} aria-label="add">
            <Plus className="size-5" />
          </Button>
        }
      />
      {ds.equipment.length === 0 ? (
        <Empty
          icon="🎣"
          title={t("سجّل معداتك", "Record your gear")}
          action={
            <Button onClick={() => setEdit("new")}>
              <Plus className="size-4" /> {t("إضافة معدة", "Add gear")}
            </Button>
          }
        >
          {t("أضف العصي والمكائن والخيوط والجكات، ثم اربطها بالرحلات لمقارنة أدائها.", "Add rods, reels, lines and jigs, then attach them to trips to compare how they perform.")}
        </Empty>
      ) : (
        EQUIPMENT_CATEGORIES.filter((c) => ds.equipment.some((e) => e.category === c)).map((c) => (
          <section key={c}>
            <SectionTitle>{label(EQUIP_LABEL, c, lang)}</SectionTitle>
            <div className="space-y-2">
              {ds.equipment
                .filter((e) => e.category === c)
                .sort((a, b) => Number(a.retired) - Number(b.retired) || a.name.localeCompare(b.name))
                .map((e) => {
                  const u = usage(e.id);
                  return (
                    <button key={e.id} onClick={() => setEdit(e)} className="w-full text-start">
                      <Card className="flex items-center gap-3 hover:bg-surface-2">
                        <Photo mediaId={e.photo_media_id} className="size-14 shrink-0 rounded-xl" fallback={<span className="text-xl">🎣</span>} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="truncate">{e.name}</span>
                            {e.retired && <Badge>{t("متقاعدة", "Retired")}</Badge>}
                          </div>
                          <div className="truncate text-xs text-muted">{[e.brand, e.model, e.pe_rating ? `PE${e.pe_rating}` : null].filter(Boolean).join(" · ") || "—"}</div>
                          <div className="text-xs text-ink-2">{t(`${u.trips} رحلة · ${u.fish} سمكة`, `${u.trips} trips · ${u.fish} fish`)}</div>
                        </div>
                      </Card>
                    </button>
                  );
                })}
            </div>
          </section>
        ))
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? t("معدة جديدة", "New gear") : t("تعديل المعدة", "Edit gear")}>
        {edit && <EquipmentForm initial={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </>
  );
}

function EquipmentForm({ initial, onDone }: { initial: Equipment | null; onDone: () => void }) {
  const { save, remove, addPhoto } = useStore();
  const { t, lang } = useI18n();
  const ts = new Date().toISOString();
  const [e, setE] = useState<Equipment>(
    initial ?? {
      id: uuid(), category: "rod", name: "", brand: null, model: null, specs: null, pe_rating: null, photo_media_id: null,
      notes: null, retired: false, is_demo: false, created_at: ts, updated_at: ts,
    },
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Equipment>(k: K, v: Equipment[K]) => setE((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative size-20 shrink-0 overflow-hidden rounded-xl">
          <Photo mediaId={e.photo_media_id} className="size-full" fallback={<ImagePlus className="size-6 text-muted" />} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (ev) => {
            const f = ev.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              const m = await addPhoto(f);
              set("photo_media_id", m.id);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Field label={t("الفئة", "Category")} className="flex-1">
          <Select value={e.category} onChange={(v) => v && set("category", v as EquipmentCategory)} options={EQUIPMENT_CATEGORIES.map((c) => ({ value: c, label: label(EQUIP_LABEL, c, lang) }))} />
        </Field>
      </div>
      <Field label={t("الاسم *", "Name *")} error={err}>
        <Input value={e.name} onChange={(ev) => set("name", ev.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("الماركة", "Brand")}>
          <Input value={e.brand ?? ""} onChange={(ev) => set("brand", ev.target.value || null)} />
        </Field>
        <Field label={t("الموديل", "Model")}>
          <Input value={e.model ?? ""} onChange={(ev) => set("model", ev.target.value || null)} />
        </Field>
      </div>
      {(e.category === "line" || e.category === "reel" || e.category === "rod" || e.category === "leader") && (
        <Field label="PE">
          <NumberInput value={e.pe_rating} onChange={(v) => set("pe_rating", v)} />
        </Field>
      )}
      <Field label={t("المواصفات", "Specifications")} hint={t("مثال: 1.8م، 150-300غ، drag 10kg", "e.g. 1.8 m, 150–300 g, 10 kg drag")}>
        <Input value={e.specs ?? ""} onChange={(ev) => set("specs", ev.target.value || null)} />
      </Field>
      <Field label={t("ملاحظات", "Notes")}>
        <Textarea value={e.notes ?? ""} onChange={(ev) => set("notes", ev.target.value || null)} />
      </Field>
      <Toggle checked={e.retired} onChange={(v) => set("retired", v)} label={t("لم أعد أستخدمها (تبقى في السجلات)", "No longer used (kept in history)")} />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          loading={busy}
          onClick={async () => {
            if (!e.name.trim()) return setErr(t("الاسم مطلوب", "Name is required"));
            if (e.pe_rating != null && (e.pe_rating <= 0 || e.pe_rating > 20)) return setErr(t("PE غير منطقي", "PE out of range"));
            await save("equipment", { ...e, name: e.name.trim() });
            onDone();
          }}
        >
          {t("حفظ", "Save")}
        </Button>
        {initial && (
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm(t("حذف هذه المعدة؟ ستُزال من الرحلات المرتبطة.", "Delete this gear? It will be removed from linked trips."))) return;
              await remove("equipment", initial);
              onDone();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
