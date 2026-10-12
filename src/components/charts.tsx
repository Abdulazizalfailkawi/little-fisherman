"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n";

export interface BarDatum {
  label: string;
  value: number | null;
  /** Extra lines for the tooltip (e.g. sample size). */
  detail?: string;
  /** Dim bars whose sample is too small to read anything into. */
  weak?: boolean;
}

/**
 * Single-series magnitude bar chart. One hue (teal), thin bars with rounded
 * data-ends, recessive grid, hover tooltip. No legend: the card title names
 * the series.
 */
export function Bars({ data, height = 180, format = (v: number) => String(Math.round(v * 100) / 100) }: { data: BarDatum[]; height?: number; format?: (v: number) => string }) {
  const { dir } = useI18n();
  const rows = data.map((d) => ({ ...d, v: d.value ?? 0 }));
  return (
    <div dir="ltr" style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#213d63" strokeOpacity={0.5} />
          <XAxis dataKey="label" reversed={dir === "rtl"} tick={{ fill: "#7f97b3", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#213d63" }} interval="preserveStartEnd" />
          <YAxis orientation={dir === "rtl" ? "right" : "left"} tick={{ fill: "#7f97b3", fontSize: 11 }} tickLine={false} axisLine={false} width={40} allowDecimals />
          <Tooltip
            cursor={{ fill: "rgba(45,212,191,0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as BarDatum & { v: number };
              return (
                <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-xl" dir={dir}>
                  <div className="font-semibold">{d.label}</div>
                  <div>{d.value == null ? "—" : format(d.value)}</div>
                  {d.detail && <div className="text-muted">{d.detail}</div>}
                </div>
              );
            }}
          />
          <Bar
            dataKey="v"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; payload: BarDatum };
              if (!p.height || p.height <= 0) return <g />;
              const r = Math.min(4, p.width / 2, p.height);
              const { x, y, width: w, height: h } = p;
              return (
                <path
                  d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`}
                  fill="#2dd4bf"
                  fillOpacity={p.payload.weak ? 0.35 : 0.9}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Inline magnitude bar for tables. */
export function InlineBar({ value, max, weak }: { value: number; max: number; weak?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-teal" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, opacity: weak ? 0.4 : 0.9 }} />
    </div>
  );
}
