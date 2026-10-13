"use client";

// Manually entered high/low tide events (e.g. copied from the official Kuwait
// Meteorological Center table) for one spot and one Kuwait date. Stored on the
// device and always labelled "manual".

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { KMC_MARINE_URL } from "@/lib/marine/stations";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import { Button, Choice, Input, NumberInput, Select } from "./ui";

export interface ManualTideEvent {
  t: number;
  type: "high" | "low";
  h: number | null;
}
export interface ManualTideDay {
  station: string;
  events: ManualTideEvent[];
  savedAt: number;
}

const key = (spot: string, day: string) => `ft.manualTide:${spot}:${day}`;

export function readManualTide(spot: string, day: string): ManualTideDay | null {
  try {
    const raw = localStorage.getItem(key(spot, day));
    return raw ? (JSON.parse(raw) as ManualTideDay) : null;
  } catch {
    return null;
  }
}

export function ManualTideForm({ spot, day, onDone }: { spot: string; day: string; onDone: () => void }) {
  const { t } = useI18n();
  const [station, setStation] = useState<string | null>("shuwaikh");
  const [rows, setRows] = useState<{ type: "high" | "low"; at: string; h: number | null }[]>([
    { type: "high", at: "", h: null },
    { type: "low", at: "", h: null },
    { type: "high", at: "", h: null },
    { type: "low", at: "", h: null },
  ]);
  useEffect(() => {
    const ex = readManualTide(spot, day);
    if (ex) {
      setStation(ex.station);
      const r = ex.events.map((e) => ({ type: e.type, at: toLocalInput(new Date(e.t).toISOString()), h: e.h }));
      while (r.length < 4) r.push({ type: r.length % 2 ? "low" : "high", at: "", h: null });
      setRows(r);
    }
  }, [spot, day]);

  const save = () => {
    const events = rows
      .filter((r) => r.at)
      .map((r) => ({ t: Date.parse(fromLocalInput(r.at) ?? ""), type: r.type, h: r.h }))
      .filter((e) => Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t);
    try {
      if (events.length) localStorage.setItem(key(spot, day), JSON.stringify({ station: station ?? "other", events, savedAt: Date.now() }));
      else localStorage.removeItem(key(spot, day));
    } catch {}
    onDone();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted">
        {t("انسخ أوقات المد والجزر الرسمية من ", "Copy the official tide times from ")}
        <a className="text-teal underline" href={KMC_MARINE_URL} target="_blank" rel="noreferrer">
          met.gov.kw
        </a>
        {t(" — تُحفظ على جهازك وتُعرض كـ«يدوي»، وتُستخدم بدلاً من النموذج لهذا اليوم والموقع.", " — saved on this device, shown as “manual”, and used instead of the model for this day and spot.")}
      </p>
      <Select
        value={station}
        onChange={setStation}
        options={[
          { value: "shuwaikh", label: t("ميناء الشويخ", "Shuwaikh port") },
          { value: "shuaiba", label: t("ميناء الشعيبة", "Shuaiba port") },
          { value: "other", label: t("مصدر آخر", "Other source") },
        ]}
      />
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_5rem] items-center gap-2">
          <Choice
            value={r.type}
            allowClear={false}
            onChange={(v) => v && setRows(rows.map((x, j) => (j === i ? { ...x, type: v } : x)))}
            options={[
              { value: "high", label: "▲" },
              { value: "low", label: "▼" },
            ]}
          />
          <Input type="datetime-local" value={r.at} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)))} />
          <NumberInput value={r.h} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, h: v } : x)))} placeholder="m" />
        </div>
      ))}
      <Button className="w-full" onClick={save}>
        {t("حفظ", "Save")}
      </Button>
    </div>
  );
}
