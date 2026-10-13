"use client";

// لوحة المشرف — admin only. The numbers come from the `admin_stats()` database
// function, which itself refuses anyone but the admin account.

import { useEffect, useState } from "react";
import { Card, Notice, PageHeader, Spinner } from "@/components/ui";
import { useIsAdmin } from "@/lib/admin";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/time";

interface Row {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  trips: number;
  catches: number;
}
interface Stats {
  users: number;
  new_7d: number;
  trips: number;
  catches: number;
  list: Row[];
}

export default function AdminPage() {
  const isAdmin = useIsAdmin();
  const { mode } = useStore();
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const sb = supabase();
    if (!sb) return;
    void sb.rpc("admin_stats").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setStats(data as Stats);
    });
  }, [isAdmin]);

  if (!isAdmin)
    return (
      <>
        <PageHeader title={t("لوحة المشرف", "Admin dashboard")} back="/" />
        <Notice tone="warn">{mode === "cloud" ? t("هذه الصفحة للمشرف فقط.", "This page is for the admin only.") : t("سجّل الدخول بحساب المشرف لعرض اللوحة.", "Sign in with the admin account to see this page.")}</Notice>
      </>
    );

  const KPI = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-2xl border border-ocean/30 bg-ocean/10 p-3">
      <div className="text-xs font-medium text-ocean">{label}</div>
      <div className="text-3xl font-extrabold text-white">{value}</div>
    </div>
  );

  return (
    <>
      <PageHeader title={t("لوحة المشرف", "Admin dashboard")} back="/" />
      {err && <Notice tone="bad">{err}</Notice>}
      {!stats && !err && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <KPI label={t("المستخدمون", "Users")} value={stats.users} />
            <KPI label={t("جدد آخر ٧ أيام", "New (7 days)")} value={stats.new_7d} />
            <KPI label={t("الرحلات", "Trips")} value={stats.trips} />
            <KPI label={t("الصيدات", "Catches")} value={stats.catches} />
          </div>
          <Card className="p-3">
            <div className="mb-2 font-semibold">{t("المستخدمون", "Users")}</div>
            <div className="grid grid-cols-[1.6fr_0.6fr_0.6fr] gap-2 border-b border-line/40 pb-1.5 text-[11px] text-muted">
              <span>{t("الإيميل", "Email")}</span>
              <span className="text-center">{t("رحلات", "Trips")}</span>
              <span className="text-center">{t("صيدات", "Catches")}</span>
            </div>
            {stats.list.map((u) => (
              <div key={u.id} className="grid grid-cols-[1.6fr_0.6fr_0.6fr] items-center gap-2 border-b border-line/20 py-2 text-sm last:border-0">
                <span className="min-w-0">
                  <span className="ltr block truncate">{u.email ?? "—"}</span>
                  <span className="block text-[10px] text-muted">
                    {t("انضم", "joined")} {fmtDate(u.created_at, lang)} · {u.last_sign_in_at ? `${t("آخر دخول", "last seen")} ${fmtDate(u.last_sign_in_at, lang)}` : t("ما دخل بعد", "never signed in")}
                  </span>
                </span>
                <b className="text-center">{u.trips}</b>
                <b className="text-center">{u.catches}</b>
              </div>
            ))}
          </Card>
          <p className="text-[11px] text-muted">{t("الأرقام تشمل مستخدمي الحسابات السحابية فقط (من يستخدم التطبيق بدون حساب بياناته على جهازه ولا تظهر هنا).", "Cloud accounts only — people using the app without an account keep their data on their device and aren't counted.")}</p>
        </div>
      )}
    </>
  );
}
