"use client";

import Link from "next/link";
import { Cloud, CloudOff, HardDrive, Loader2, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";

/** Always-visible connectivity / sync state. Taps through to Settings › Sync. */
export function SyncBadge() {
  const { mode, online, syncing, pending, failed } = useStore();
  const { t } = useI18n();
  if (!mode) return null;

  let icon = <Cloud className="size-4" />;
  let text = t("متزامن", "Synced");
  let tone = "text-good border-good/30 bg-good/10";

  if (mode === "local") {
    icon = <HardDrive className="size-4" />;
    text = t("على الجهاز", "This device");
    tone = "text-ink-2 border-line bg-surface-2";
  } else if (failed.length) {
    icon = <TriangleAlert className="size-4" />;
    text = t(`${failed.length} خطأ`, `${failed.length} error`);
    tone = "text-bad border-bad/30 bg-bad/10";
  } else if (!online) {
    icon = <CloudOff className="size-4" />;
    text = pending ? t(`غير متصل · ${pending}`, `Offline · ${pending}`) : t("غير متصل", "Offline");
    tone = "text-warn border-warn/30 bg-warn/10";
  } else if (syncing) {
    icon = <Loader2 className="size-4 animate-spin" />;
    text = t("مزامنة…", "Syncing…");
    tone = "text-[#8cc0ff] border-ocean/30 bg-ocean/10";
  } else if (pending) {
    icon = <CloudOff className="size-4" />;
    text = t(`${pending} بانتظار المزامنة`, `${pending} pending`);
    tone = "text-warn border-warn/30 bg-warn/10";
  }

  return (
    <Link href="/settings#sync" className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${tone}`}>
      {icon}
      <span className="max-w-28 truncate">{text}</span>
    </Link>
  );
}
