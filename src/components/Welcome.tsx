"use client";

// First-run welcome: what سجي is, that it is in beta, and how to install the
// web app on the home screen so it opens like a normal app.

import { useEffect, useState } from "react";
import { Share, SquarePlus, MoreVertical, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button, Choice, Sheet } from "./ui";

const KEY = "ft.welcomed";

type Platform = "ios" | "android";

function detect(): Platform {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "ios";
}

export function Welcome() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detect());
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {}
    if (!seen) setOpen(true);
    const again = () => setOpen(true);
    window.addEventListener("ft:welcome", again);
    return () => window.removeEventListener("ft:welcome", again);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setOpen(false);
  };

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ocean/20 text-sm font-bold text-white">{n}</span>
      <span className="pt-0.5 text-sm leading-relaxed text-ink-2">{children}</span>
    </li>
  );

  return (
    <Sheet open={open} onClose={close} title={t("أهلاً بك في سجي", "Welcome to SAJJI")}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <img src="/icons/sajji-mark.svg" alt="" className="size-16 shrink-0" />
          <p className="text-sm leading-relaxed text-ink-2">
            {t(
              "سجي يتابع المد والجزر (سجي وثبر) وحالة البحر، ويسجّل رحلاتك وصيدك وإحصائياتك — كلها في مكان واحد.",
              "SAJJI tracks the tide (saji/thabr) and sea conditions, and logs your trips, catches and stats in one place.",
            )}
          </p>
        </div>

        <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-warn">
          <b>{t("نسخة بيتا (تجريبية):", "Beta version:")}</b>{" "}
          {t(
            "ممكن تواجه أخطاء أو تغييرات بين فترة وفترة. والمد والموج والرياح تقديرات من نماذج وقد تختلف عن النشرة الرسمية للأرصاد — لا تعتمد عليها وحدها في البحر.",
            "You may run into bugs or changes. Tide, waves and wind are model estimates that can differ from the official bulletin — don't rely on them alone at sea.",
          )}
        </div>

        {installed ? (
          <p className="rounded-xl bg-good/10 px-3 py-2.5 text-sm text-good">{t("✓ التطبيق مثبّت على جهازك ويعمل بملء الشاشة.", "✓ The app is installed and runs full-screen.")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-ocean" /> {t("ثبّته على جوالك ليشتغل مثل أي تطبيق", "Install it on your phone to use it like any app")}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {t(
                "سجي تطبيق ويب: يفتح أول مرة من المتصفح. أضفه إلى الشاشة الرئيسية ويصير له أيقونة ويفتح بملء الشاشة بدون شريط المتصفح، ويشتغل حتى بدون إنترنت.",
                "SAJJI is a web app: it first opens in your browser. Add it to your home screen to get an icon, full-screen mode, and offline use.",
              )}
            </p>
            <Choice<Platform>
              value={platform}
              allowClear={false}
              onChange={(v) => v && setPlatform(v)}
              options={[
                { value: "ios", label: t("آيفون (Safari)", "iPhone (Safari)") },
                { value: "android", label: t("أندرويد (Chrome)", "Android (Chrome)") },
              ]}
            />
            {platform === "ios" ? (
              <ol className="space-y-3">
                <Step n={1}>{t("افتح الرابط في متصفح Safari (مو من داخل تطبيق ثاني مثل واتساب).", "Open the link in Safari (not inside another app like WhatsApp).")}</Step>
                <Step n={2}>
                  {t("اضغط زر المشاركة ", "Tap the Share button ")}
                  <Share className="mx-1 inline size-4 align-text-bottom text-ocean" />
                  {t("(المربع اللي فوقه سهم) في الشريط السفلي.", "(the square with an arrow) in the bottom bar.")}
                </Step>
                <Step n={3}>
                  {t("مرّر لتحت واختر «إضافة إلى الشاشة الرئيسية» ", "Scroll down and choose “Add to Home Screen” ")}
                  <SquarePlus className="mx-1 inline size-4 align-text-bottom text-ocean" />
                </Step>
                <Step n={4}>{t("اضغط «إضافة» فوق. تطلع أيقونة سجي على شاشتك، افتحها منها.", "Tap “Add” at the top. The SAJJI icon appears on your home screen — open it from there.")}</Step>
              </ol>
            ) : (
              <ol className="space-y-3">
                <Step n={1}>{t("افتح الرابط في متصفح Chrome.", "Open the link in Chrome.")}</Step>
                <Step n={2}>
                  {t("اضغط قائمة النقاط الثلاث ", "Tap the three-dot menu ")}
                  <MoreVertical className="mx-1 inline size-4 align-text-bottom text-ocean" />
                  {t("أعلى المتصفح.", "at the top of the browser.")}
                </Step>
                <Step n={3}>{t("اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».", "Choose “Install app” or “Add to Home screen”.")}</Step>
                <Step n={4}>{t("أكّد بزر «تثبيت». تطلع أيقونة سجي على شاشتك، افتحها منها.", "Confirm with “Install”. The SAJJI icon appears on your home screen — open it from there.")}</Step>
              </ol>
            )}
          </div>
        )}

        <Button size="lg" className="w-full" onClick={close}>
          {t("ابدأ", "Get started")}
        </Button>
      </div>
    </Sheet>
  );
}
