"use client";

import { useMemo, useState } from "react";
import { Archive, Plus, Trash2 } from "lucide-react";
import { SpeciesPicker } from "@/components/pickers";
import { Badge, Button, Card, Choice, Field, Input, NumberInput, Notice, PageHeader, Progress, SectionTitle, Select, Sheet, cn } from "@/components/ui";
import { evaluateAchievements, nextMilestone } from "@/lib/achievements";
import { useStore } from "@/lib/db/store";
import { goalProgress } from "@/lib/goals";
import { uuid } from "@/lib/ids";
import { GOAL_LABEL, useI18n } from "@/lib/i18n";
import { tripRows } from "@/lib/stats";
import { addDays, dateKey, fmtDate, todayKey } from "@/lib/time";
import { GOAL_KINDS, type Goal, type GoalKind } from "@/lib/types";

export default function AchievementsPage() {
  const { ds, idx, save, remove } = useStore();
  const { t, lang, num } = useI18n();
  const rows = useMemo(() => tripRows(ds, idx), [ds, idx]);
  const states = useMemo(() => evaluateAchievements(ds, idx, rows), [ds, idx, rows]);
  const unlocked = states.filter((s) => s.unlocked);
  const next = nextMilestone(states);
  const [creating, setCreating] = useState(false);
  const goals = ds.goals.filter((g) => g.status === "active");
  const archived = ds.goals.filter((g) => g.status === "archived");

  return (
    <>
      <PageHeader section="stats" title={t("الإنجازات والأهداف", "Achievements & goals")} />

      <Card className="flex items-center gap-4">
        <div className="text-4xl">🏆</div>
        <div className="flex-1">
          <div className="text-sm text-muted">{t("الإنجازات المفتوحة", "Unlocked")}</div>
          <div className="text-2xl font-bold">
            {unlocked.length} / {states.length}
          </div>
          <Progress value={unlocked.length / states.length} />
        </div>
      </Card>
      {next && (
        <Notice className="mt-2">
          {t("الهدف التالي:", "Next milestone:")} <b>{t(next.def.name_ar, next.def.name_en)}</b> — {next.current}/{next.target}
        </Notice>
      )}

      <SectionTitle action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("هدف", "Goal")}</Button>}>
        {t("أهدافي", "My goals")}
      </SectionTitle>
      {goals.length === 0 && <p className="px-1 text-sm text-muted">{t("لا توجد أهداف نشطة. أضف هدفاً مثل «صيد ٢٠ بالول».", "No active goals. Add one like “Catch 20 Balool”.")}</p>}
      <div className="space-y-2">
        {goals.map((g) => {
          const p = goalProgress(g, ds, idx);
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{g.title}</div>
                  <div className="text-xs text-muted">
                    {GOAL_LABEL[g.kind][lang]}
                    {g.period_start || g.period_end ? ` · ${g.period_start ? fmtDate(g.period_start + "T09:00:00Z", lang) : "…"} → ${g.period_end ? fmtDate(g.period_end + "T09:00:00Z", lang) : "…"}` : ` · ${t("بدون مدة", "no time limit")}`}
                  </div>
                </div>
                {p.complete ? <Badge tone="good">✓ {t("تحقق", "Done")}</Badge> : <Badge>{Math.round(p.ratio * 100)}%</Badge>}
              </div>
              <div className="my-2">
                <Progress value={p.ratio} tone={p.complete ? "good" : "teal"} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="ltr">
                  {num(p.current)} / {num(p.target)}
                  {g.kind === "technique_success_rate" ? "%" : ""}
                  {p.sample != null ? ` (n=${p.sample})` : ""}
                </span>
                <span className="flex gap-1">
                  <button className="rounded-lg p-2 hover:bg-surface-2" aria-label="archive" onClick={() => save("goals", { ...g, status: "archived" })}>
                    <Archive className="size-4" />
                  </button>
                  <button className="rounded-lg p-2 text-bad hover:bg-surface-2" aria-label="delete" onClick={() => remove("goals", g)}>
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </div>
              {p.note && <p className="mt-1 text-xs text-warn">{t(p.note.ar, p.note.en)}</p>}
              {g.baseline?.success_rate != null && (
                <p className="mt-1 text-xs text-muted">
                  {t(`النسبة عند إنشاء الهدف: ${Math.round(g.baseline.success_rate)}% (${g.baseline.trips} رحلة)`, `Rate when created: ${Math.round(g.baseline.success_rate)}% (${g.baseline.trips} trips)`)}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <SectionTitle>{t("الإنجازات", "Achievements")}</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[...states].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map((s) => (
          <Card key={s.def.code} className={cn("flex items-center gap-3", !s.unlocked && "opacity-70")}>
            <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-2xl", s.unlocked ? "bg-teal/15" : "bg-surface-2 grayscale")}>{s.def.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t(s.def.name_ar, s.def.name_en)}</div>
              <div className="text-xs text-muted">{t(s.def.desc_ar, s.def.desc_en)}</div>
              {s.unlocked ? (
                <div className="mt-1 text-xs text-good">
                  ✓ {s.unlockedAt ? fmtDate(s.unlockedAt, lang) : ""}
                  {s.detail ? ` · ${t(s.detail.ar, s.detail.en)}` : ""}
                </div>
              ) : (
                <div className="mt-1.5">
                  <Progress value={s.current / s.target} tone="ocean" />
                  <div className="mt-0.5 text-[11px] text-muted">
                    {s.current}/{s.target} · {Math.round((s.current / s.target) * 100)}%{s.detail ? ` · ${t(s.detail.ar, s.detail.en)}` : ""}
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 px-1 text-xs text-muted">
        {t("الإنجازات تُحسب تلقائياً من سجلاتك. الرحلات بدون صيد لا تُكافأ ولا تُعاقب.", "Achievements are computed from your records. Trips without a catch are never rewarded or penalised.")}
      </p>

      {archived.length > 0 && (
        <>
          <SectionTitle>{t("أهداف مؤرشفة", "Archived goals")}</SectionTitle>
          <Card className="divide-y divide-line/40 p-0">
            {archived.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>{g.title}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => save("goals", { ...g, status: "active" })}>
                    {t("استعادة", "Restore")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove("goals", g)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title={t("هدف جديد", "New goal")}>
        <GoalForm onDone={() => setCreating(false)} />
      </Sheet>
    </>
  );
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const { ds, idx, save } = useStore();
  const { t, lang, name } = useI18n();
  const [kind, setKind] = useState<GoalKind>("species_count");
  const [target, setTarget] = useState<number | null>(null);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [period, setPeriod] = useState<"all" | "month" | "custom">("all");
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(addDays(todayKey(), 30));
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const needsSpecies = kind === "species_count" || kind === "species_with_technique";
  const needsTech = kind === "technique_success_rate" || kind === "species_with_technique";

  const autoTitle = () => {
    const sp = speciesId ? name(idx.speciesById.get(speciesId)) : "";
    const tc = techniqueId ? name(idx.techById.get(techniqueId)) : "";
    const n = target ?? "?";
    switch (kind) {
      case "species_count":
        return t(`صيد ${n} ${sp}`, `Catch ${n} ${sp}`);
      case "distinct_species":
        return t(`${n} أنواع مختلفة`, `${n} different species`);
      case "trip_count":
        return t(`${n} رحلات`, `${n} trips`);
      case "catch_count":
        return t(`${n} سمكة`, `${n} fish`);
      case "fish_over_weight":
        return t(`سمكة فوق ${n} كغ`, `A fish over ${n} kg`);
      case "fish_over_length":
        return t(`سمكة فوق ${n} سم`, `A fish over ${n} cm`);
      case "technique_success_rate":
        return t(`نجاح ${tc} ${n}%`, `${tc} success ${n}%`);
      case "species_with_technique":
        return t(`${n} ${sp} بـ${tc}`, `${n} ${sp} by ${tc}`);
    }
  };

  const submit = async () => {
    if (!target || target <= 0) return setErr(t("حدد الرقم المستهدف", "Set a target number"));
    if (needsSpecies && !speciesId) return setErr(t("اختر النوع", "Choose a species"));
    if (needsTech && !techniqueId) return setErr(t("اختر الطريقة", "Choose a technique"));
    if (kind === "technique_success_rate" && target > 100) return setErr(t("النسبة لا تتجاوز ١٠٠", "Rate can't exceed 100"));
    const today = todayKey();
    const [ps, pe] =
      period === "all"
        ? [null, null]
        : period === "month"
          ? [today.slice(0, 8) + "01", dateKey(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0, 12)))]
          : [from, to];
    if (ps && pe && pe < ps) return setErr(t("تاريخ النهاية قبل البداية", "End date is before start"));
    let baseline: Goal["baseline"] = null;
    if (kind === "technique_success_rate" && techniqueId) {
      const rs = tripRows(ds, idx, { techniqueId });
      baseline = { trips: rs.length, success_rate: rs.length ? (rs.filter((r) => r.success).length / rs.length) * 100 : 0 };
    }
    const ts = new Date().toISOString();
    await save("goals", {
      id: uuid(),
      title: (title.trim() || autoTitle()).slice(0, 120),
      kind,
      target_value: target,
      species_id: needsSpecies || kind === "fish_over_weight" || kind === "fish_over_length" ? speciesId : null,
      technique_id: needsTech || kind === "species_count" ? techniqueId : null,
      period_start: ps,
      period_end: pe,
      baseline,
      status: "active",
      is_demo: false,
      created_at: ts,
      updated_at: ts,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label={t("نوع الهدف", "Goal type")}>
        <Select value={kind} onChange={(v) => v && setKind(v as GoalKind)} options={GOAL_KINDS.map((k) => ({ value: k, label: GOAL_LABEL[k][lang] }))} />
      </Field>
      <Field label={kind === "technique_success_rate" ? t("النسبة المستهدفة (%)", "Target rate (%)") : t("الرقم المستهدف", "Target")}>
        <NumberInput value={target} onChange={setTarget} />
      </Field>
      {(needsSpecies || kind === "fish_over_weight" || kind === "fish_over_length") && (
        <Field label={needsSpecies ? t("النوع", "Species") : t("النوع (اختياري)", "Species (optional)")}>
          <SpeciesPicker value={speciesId} onChange={setSpeciesId} />
        </Field>
      )}
      {(needsTech || kind === "species_count") && (
        <Field label={needsTech ? t("الطريقة", "Technique") : t("الطريقة (اختياري)", "Technique (optional)")}>
          <Choice value={techniqueId} onChange={setTechniqueId} options={ds.techniques.map((x) => ({ value: x.id, label: name(x) }))} />
        </Field>
      )}
      <Field label={t("المدة", "Period")}>
        <Choice
          value={period}
          allowClear={false}
          onChange={(v) => v && setPeriod(v)}
          options={[
            { value: "all", label: t("بدون مدة", "No limit") },
            { value: "month", label: t("هذا الشهر", "This month") },
            { value: "custom", label: t("مخصص", "Custom") },
          ]}
        />
      </Field>
      {period === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
      <Field label={t("العنوان (اختياري)", "Title (optional)")} hint={autoTitle()}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {err && <Notice tone="bad">{err}</Notice>}
      <Button className="w-full" onClick={submit}>
        {t("حفظ الهدف", "Save goal")}
      </Button>
    </div>
  );
}
