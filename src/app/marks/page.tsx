"use client";

// إحداثياتي — every coordinate saved with "mark here", newest first.

import { useState } from "react";
import { Check, Copy, ExternalLink, MapPinned, Pencil, Trash2 } from "lucide-react";
import { Button, Card, Empty, Field, Input, LinkButton, Notice, PageHeader, Sheet, Textarea } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { fmtDepth } from "@/lib/depth";
import { useDepthUnit } from "@/lib/depth";
import { useI18n } from "@/lib/i18n";
import { fmtDate, fmtTime } from "@/lib/time";
import type { Mark } from "@/lib/types";

const coordsOf = (m: Mark) => `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`;

export default function MarksPage() {
  const { ds, save, remove } = useStore();
  const { t, lang } = useI18n();
  const du = useDepthUnit();
  const [copied, setCopied] = useState<string | null>(null);
  const [edit, setEdit] = useState<Mark | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const marks = [...ds.marks].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <PageHeader title={t("إحداثياتي", "My coordinates")} subtitle={t(`${marks.length} إحداثية مخزّنة`, `${marks.length} saved`)} back="/trips" />
      {!marks.length ? (
        <Empty icon="📍" title={t("ما خزّنت إحداثيات بعد", "No coordinates saved yet")} action={<LinkButton href="/">{t("روح لصفحة البحر", "Go to the sea page")}</LinkButton>}>
          {t("إذا صدت سمكة في مكان، اضغط «علّم هنا» فوق في صفحة البحر عشان تخزّن إحداثية المكان اللي واقف عليه.", "When you catch a fish somewhere, tap “Mark here” at the top of the sea page to save the coordinate you are standing on.")}
        </Empty>
      ) : (
        <div className="space-y-2">
          {marks.map((m) => (
            <Card key={m.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPinned className="mt-0.5 size-5 shrink-0 text-ocean" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name}</div>
                  <div className="text-xs text-ink-2">
                    {fmtDate(m.created_at, lang)} · {fmtTime(m.created_at, lang)}
                    {m.depth_m != null && <> · {t("العمق", "depth")} <bdi>{fmtDepth(m.depth_m, du, lang)}</bdi></>}
                  </div>
                </div>
              </div>
              <div className="ltr rounded-xl bg-surface-2 px-3 py-2 text-center font-mono text-base font-bold">{coordsOf(m)}</div>
              {m.notes && <p className="whitespace-pre-wrap text-sm text-ink-2">{m.notes}</p>}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  aria-label={t("نسخ", "Copy")}
                  className="grid h-11 place-items-center rounded-xl border border-line bg-surface-2"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(coordsOf(m));
                      setCopied(m.id);
                      setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500);
                    } catch {}
                  }}
                >
                  {copied === m.id ? <Check className="size-5 text-good" /> : <Copy className="size-5" />}
                </button>
                <a
                  aria-label={t("فتح في الخرائط", "Open in Maps")}
                  href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-11 place-items-center rounded-xl border border-line bg-surface-2"
                >
                  <ExternalLink className="size-5" />
                </a>
                <button
                  type="button"
                  aria-label={t("تعديل", "Edit")}
                  className="grid h-11 place-items-center rounded-xl border border-line bg-surface-2"
                  onClick={() => {
                    setEdit(m);
                    setName(m.name);
                    setNotes(m.notes ?? "");
                  }}
                >
                  <Pencil className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t("حذف", "Delete")}
                  className="grid h-11 place-items-center rounded-xl border border-bad/40 bg-bad/10 text-bad"
                  onClick={async () => {
                    if (!confirm(t("حذف هذي الإحداثية؟", "Delete this coordinate?"))) return;
                    await remove("marks", m);
                  }}
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            </Card>
          ))}
          <Notice tone="info">{t("هذي إحداثيات مرجعية لك فقط، ما تظهر في قائمة مواقع الرحلات.", "These are your own reference points; they are not part of the spots used for trips.")}</Notice>
        </div>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={t("تعديل الإحداثية", "Edit coordinate")}>
        {edit && (
          <div className="space-y-4">
            <Field label={t("الاسم", "Name")}>
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("ملاحظة", "Note")}>
              <Textarea rows={3} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button
              size="lg"
              className="w-full"
              disabled={!name.trim()}
              onClick={async () => {
                await save("marks", { ...edit, name: name.trim(), notes: notes.trim() || null });
                setEdit(null);
              }}
            >
              {t("حفظ", "Save")}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
