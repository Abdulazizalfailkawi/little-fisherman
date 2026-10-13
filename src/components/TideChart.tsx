"use client";

// Interactive 24-hour tide chart (SVG). Tap or drag to inspect any time:
// the readout shows the predicted level and سجي / ثبر / وقفة at that moment.
// Rising parts are teal, falling parts coral, estimated waqfa windows shaded.
// The curve is a monotone-cubic interpolation through the provider's hourly
// values (no overshoot); values between samples are estimates.

import { useMemo, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import type { Pt } from "@/lib/marine/tide";
import { smoothSeries, type TurnEvent } from "@/lib/marine/waqfa";

const W = 360;
const HGT = 200;
const PAD = { l: 34, r: 10, t: 26, b: 24 };

export function TideChart({
  pts,
  turns,
  from,
  to,
  now,
  selected,
  onSelect,
}: {
  pts: Pt[];
  turns: TurnEvent[];
  from: number;
  to: number;
  now: number;
  selected: number | null;
  onSelect: (t: number | null) => void;
}) {
  const { lang } = useI18n();
  const ref = useRef<SVGSVGElement>(null);
  const dense = useMemo(() => smoothSeries(pts.filter((p) => p.t >= from - 3_600_000 && p.t <= to + 3_600_000)).filter((p) => p.t >= from && p.t <= to), [pts, from, to]);
  const vis = turns.filter((x) => x.t >= from && x.t <= to);

  if (dense.length < 3) return null;
  const lo = Math.min(...dense.map((p) => p.h));
  const hi = Math.max(...dense.map((p) => p.h));
  const pad = (hi - lo) * 0.12 || 0.2;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const x = (t: number) => PAD.l + ((t - from) / (to - from)) * (W - PAD.l - PAD.r);
  const y = (h: number) => PAD.t + (1 - (h - y0) / (y1 - y0)) * (HGT - PAD.t - PAD.b);
  const fmtH = (t: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));

  // Split the curve into rising / falling runs.
  const runs: { rising: boolean; p: Pt[] }[] = [];
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    const next = dense[i + 1] ?? p;
    const prev = dense[i - 1] ?? p;
    const rising = next.h - prev.h >= 0;
    const last = runs[runs.length - 1];
    if (last && last.rising === rising) last.p.push(p);
    else runs.push({ rising, p: last ? [last.p[last.p.length - 1], p] : [p] });
  }
  const path = (ps: Pt[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.h).toFixed(1)}`).join("");
  const area = (ps: Pt[]) => `${path(ps)}L${x(ps[ps.length - 1].t).toFixed(1)},${HGT - PAD.b}L${x(ps[0].t).toFixed(1)},${HGT - PAD.b}Z`;

  const ticks: number[] = [];
  const firstTick = Math.ceil(from / (3 * 3_600_000)) * 3 * 3_600_000;
  for (let t = firstTick; t <= to; t += 3 * 3_600_000) ticks.push(t);
  const yTicks = [y0 + pad, (y0 + y1) / 2, y1 - pad];

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const sx = ((clientX - r.left) / r.width) * W;
    const t = from + ((sx - PAD.l) / (W - PAD.l - PAD.r)) * (to - from);
    onSelect(Math.max(from, Math.min(to, t)));
  };
  const selPt = selected != null ? dense.reduce((b, p) => (Math.abs(p.t - selected) < Math.abs(b.t - selected) ? p : b), dense[0]) : null;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${HGT}`}
      className="w-full select-none"
      style={{ touchAction: "pan-y", direction: "ltr" }}
      role="img"
      aria-label="tide chart"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType !== "mouse") pick(e.clientX);
      }}
    >
      <defs>
        <linearGradient id="gRise" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-rise)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--color-rise)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gFall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-fall)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--color-fall)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#213d63" strokeOpacity="0.5" />
          <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#7f97b3">
            {(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={HGT - 8} textAnchor="middle" fontSize="9" fill="#7f97b3">
          {fmtH(t)}
        </text>
      ))}

      {vis.map((v) =>
        v.waqfaStart != null && v.waqfaEnd != null ? (
          <rect key={"w" + v.t} x={x(Math.max(from, v.waqfaStart))} width={Math.max(1, x(Math.min(to, v.waqfaEnd)) - x(Math.max(from, v.waqfaStart)))} y={PAD.t - 6} height={HGT - PAD.t - PAD.b + 6} fill="#fbbf24" fillOpacity="0.09" />
        ) : null,
      )}

      {runs.map((r, i) => (
        <g key={i}>
          <path d={area(r.p)} fill={r.rising ? "url(#gRise)" : "url(#gFall)"} />
          <path d={path(r.p)} fill="none" stroke={r.rising ? "var(--color-rise)" : "var(--color-fall)"} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      ))}

      {vis.map((v) => {
        const yy = v.h != null ? y(v.h) : PAD.t;
        return (
          <g key={"e" + v.t}>
            <circle cx={x(v.t)} cy={yy} r="4" fill={v.type === "high" ? "var(--color-rise)" : "var(--color-fall)"} stroke="#050d18" strokeWidth="2" />
            <text x={x(v.t)} y={v.type === "high" ? yy - 8 : Math.min(HGT - PAD.b - 4, yy + 14)} textAnchor="middle" fontSize="9" fill="#e8f0fa">
              {v.type === "high" ? "▲" : "▼"} {fmtH(v.t)}
            </text>
          </g>
        );
      })}

      {now >= from && now <= to && (
        <g>
          <line x1={x(now)} x2={x(now)} y1={PAD.t - 8} y2={HGT - PAD.b} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={x(now)} y={PAD.t - 12} textAnchor="middle" fontSize="9" fill="#fbbf24">
            {lang === "ar" ? "الآن" : "now"}
          </text>
        </g>
      )}

      {selPt && (
        <g>
          <line x1={x(selPt.t)} x2={x(selPt.t)} y1={PAD.t - 8} y2={HGT - PAD.b} stroke="#e8f0fa" strokeOpacity="0.7" />
          <circle cx={x(selPt.t)} cy={y(selPt.h)} r="5.5" fill="#e8f0fa" stroke="#050d18" strokeWidth="2" />
        </g>
      )}
      {/* generous invisible hit area */}
      <rect x={PAD.l} y={0} width={W - PAD.l - PAD.r} height={HGT} fill="transparent" />
    </svg>
  );
}
