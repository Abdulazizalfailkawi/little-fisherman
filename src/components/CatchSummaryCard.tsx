"use client";

import { useMemo, useState } from "react";
import { Copy, FileText } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { readWindUnit } from "@/lib/marine/units";
import { catchSummary, summaryText } from "@/lib/summary";
import type { Catch } from "@/lib/types";
import { Button, Card } from "./ui";

/** Automatic summary, regenerated from the saved records on every render. */
export function CatchSummaryCard({ c }: { c: Catch }) {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const s = useMemo(() => catchSummary(ds, idx, c, lang, readWindUnit(), hijriOffset), [ds, idx, c, lang, hijriOffset]);
  return (
    <Card className="space-y-2 border-teal/30">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-teal">
          <FileText className="size-4" /> {t("ملخص الصيدة", "Catch summary")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(summaryText(s));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
        >
          <Copy className="size-4" /> {copied ? t("نُسخ", "Copied") : t("نسخ", "Copy")}
        </Button>
      </div>
      <p className="leading-relaxed">{s.headline}</p>
      {s.lines.length > 0 && (
        <dl className="space-y-1 text-sm">
          {s.lines.map((l) => (
            <div key={l.label} className="flex gap-2">
              <dt className="shrink-0 text-muted">{l.label}:</dt>
              <dd className="text-ink-2">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.closing && <p className="font-medium text-teal">{s.closing}</p>}
    </Card>
  );
}
