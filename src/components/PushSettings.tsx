"use client";

// "إشعار الوقفة": turn on the notification and choose which spots to follow.

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { currentSubscription, disablePush, enablePush, isInstalled, isIos, pushSupported, testNotification, updatePushSpots, type PushSpot } from "@/lib/push";
import type { Location } from "@/lib/types";
import { Button, Notice, cn } from "./ui";

const KEY = "ft.pushSpots";

export function PushSettings({ spots, currentId }: { spots: Location[]; currentId: string | null }) {
  const { t, lang } = useI18n();
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);

  const toSpots = (ids: string[]): PushSpot[] =>
    spots.filter((s) => ids.includes(s.id) && s.lat != null && s.lng != null).map((s) => ({ name: s.name, lat: s.lat as number, lng: s.lng as number }));

  useEffect(() => {
    setSupported(pushSupported());
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {}
    setChosen(Array.isArray(saved) ? saved : []);
    void currentSubscription().then((s) => setOn(!!s));
  }, []);

  const pick = (ids: string[]) => {
    setChosen(ids);
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {}
  };

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    const ids = chosen.length ? chosen : currentId ? [currentId] : spots.slice(0, 1).map((s) => s.id);
    pick(ids);
    const r = await enablePush(toSpots(ids), lang);
    setBusy(false);
    if (r === "ok") {
      setOn(true);
      setMsg({ tone: "info", text: t("تم تفعيل إشعار الوقفة ✓", "Waqfa alerts are on ✓") });
    } else if (r === "denied") setMsg({ tone: "warn", text: t("رفضت إذن الإشعارات — فعّله من إعدادات الجوال للتطبيق.", "Notifications are blocked — allow them in your phone's settings for the app.") });
    else setMsg({ tone: "warn", text: t("تعذر التفعيل، جرّب مرة ثانية.", "Couldn't turn it on, try again.") });
  };

  if (!supported)
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">{t("إشعار الوقفة", "Waqfa alerts")}</div>
        <Notice tone="warn">
          {isIos() && !isInstalled()
            ? t("على الآيفون الإشعارات تشتغل بعد تثبيت التطبيق على الشاشة الرئيسية. افتح «دليل الاستخدام» تحت واتبع الخطوات، وبعدها فعّلها من هنا.", "On iPhone, alerts work once the app is added to the home screen. Open the guide below, then turn alerts on here.")
            : t("هذا المتصفح ما يدعم الإشعارات.", "This browser doesn't support notifications.")}
        </Notice>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{t("إشعار الوقفة", "Waqfa alerts")}</div>
      <p className="text-xs leading-relaxed text-ink-2">{t("لما تبدأ وقفة المية في الأماكن اللي تختارها يوصلك إشعار «وقفت المية» حتى لو التطبيق مقفول. الوقت تقدير من نموذج وقد يختلف عن الرسمي.", "When the water goes slack at the spots you choose, you get a “the water has stopped” alert even if the app is closed. Times are a model estimate and may differ from the official ones.")}</p>

      {on && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted">{t("الأماكن اللي تتابعها:", "Spots you follow:")}</div>
          <div className="flex flex-wrap gap-2">
            {spots.map((s) => {
              const sel = chosen.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    const ids = sel ? chosen.filter((x) => x !== s.id) : [...chosen, s.id].slice(0, 6);
                    pick(ids);
                    void updatePushSpots(toSpots(ids), lang);
                  }}
                  className={cn("min-h-10 rounded-full border px-3.5 text-sm", sel ? "border-ocean bg-ocean/20 text-white" : "border-line bg-surface-2 text-ink-2")}
                >
                  {sel ? "✓ " : ""}
                  {lang === "ar" ? s.name : s.name_en || s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {on ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const ok = await testNotification(lang);
              setMsg(ok ? { tone: "info", text: t("أرسلت لك إشعار تجريبي — إذا ما وصلك تأكد من إعدادات الإشعارات.", "Test sent — if you didn't get it, check notification settings.") } : { tone: "warn", text: t("تعذر إرسال التجربة.", "Couldn't send the test.") });
            }}
          >
            <Bell className="size-4" /> {t("جرّب إشعار", "Test alert")}
          </Button>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await disablePush();
              setOn(false);
              setBusy(false);
              setMsg(null);
            }}
          >
            <BellOff className="size-4" /> {t("إيقاف", "Turn off")}
          </Button>
        </div>
      ) : (
        <Button className="w-full" loading={busy} onClick={enable}>
          <Bell className="size-4" /> {t("فعّل إشعار الوقفة", "Turn on waqfa alerts")}
        </Button>
      )}
    </div>
  );
}
