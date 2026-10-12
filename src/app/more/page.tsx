"use client";

import Link from "next/link";
import { BarChart3, BookOpen, CalendarDays, FileText, Fish, Images, MapPin, NotebookText, Search, Settings, Trophy, Medal, Waves, Wrench } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function MorePage() {
  const { t } = useI18n();
  const items = [
    { href: "/marine", icon: Waves, label: t("لوحة البحر", "Marine dashboard"), sub: t("الطقس، الموج، المد والجزر", "Weather, waves, tide") },
    { href: "/collection", icon: Fish, label: t("مجموعتي", "My collection"), sub: t("الأنواع وصفحة كل نوع", "Species & per-species pages") },
    { href: "/catches", icon: BookOpen, label: t("سجل الصيد", "Catch history"), sub: t("كل صيدة مع ملخصها وظروفها", "Every catch with summary & conditions") },
    { href: "/reports", icon: NotebookText, label: t("تقارير أسبوعية وشهرية", "Weekly & monthly reports"), sub: t("ملخصات من سجلاتك الحقيقية", "Summaries from your real records") },
    { href: "/stats", icon: BarChart3, label: t("الإحصائيات والتحليلات", "Analytics"), sub: t("الأيام، الساعات، الطرق، القمر، المد", "Days, hours, techniques, moon, tide") },
    { href: "/calendar", icon: CalendarDays, label: t("التقويم الهجري والميلادي", "Hijri & Gregorian calendar"), sub: t("أيام الصيد والملخصات", "Fishing days & summaries") },
    { href: "/records", icon: Medal, label: t("الأرقام القياسية", "Personal records"), sub: t("الأثقل، الأطول، أفضل رحلة", "Heaviest, longest, best trip") },
    { href: "/achievements", icon: Trophy, label: t("الإنجازات والأهداف", "Achievements & goals"), sub: t("التحديات والتقدم", "Challenges & progress") },
    { href: "/equipment", icon: Wrench, label: t("المعدات", "Equipment"), sub: t("العصي، المكائن، الخيوط، الجكات", "Rods, reels, lines, jigs") },
    { href: "/spots", icon: MapPin, label: t("مواقع الصيد", "Fishing spots"), sub: t("المواقع وأداؤها", "Spots & how they perform") },
    { href: "/gallery", icon: Images, label: t("معرض الصور", "Photo gallery"), sub: t("كل صور الصيد", "All your catch photos") },
    { href: "/search", icon: Search, label: t("بحث شامل", "Search"), sub: t("الرحلات والأنواع والملاحظات", "Trips, species, notes") },
    { href: "/report", icon: FileText, label: t("تقرير الصيد", "Fishing report"), sub: t("للطباعة أو حفظه PDF", "Print or save as PDF") },
    { href: "/settings", icon: Settings, label: t("الإعدادات والنسخ الاحتياطي", "Settings & backup"), sub: t("اللغة، الهجري، التصدير، المزامنة", "Language, Hijri, export, sync") },
  ];
  return (
    <>
      <PageHeader title={t("المزيد", "More")} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-4 hover:bg-surface-2">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal/10">
              <i.icon className="size-6 text-teal" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold">{i.label}</div>
              <div className="truncate text-xs text-muted">{i.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
