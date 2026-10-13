"use client";

// Web push for the "the water has stopped" (waqfa) notification.
// The phone subscribes with the public VAPID key; the server (a scheduled
// Supabase function) pushes when a waqfa starts at one of the chosen spots.

export const VAPID_PUBLIC = "BL1luqDBJ2Gw5q70sK35yyrnaUkzgwKNM9lDYqBiZ8rFJ6Ij5dt8scqUImOvRrqSXIzY30aLGB2b4vCvg7OLP2M";
const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/push-subscribe`;

export interface PushSpot {
  name: string;
  lat: number;
  lng: number;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isIos(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function send(body: unknown): Promise<boolean> {
  try {
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

export type EnableResult = "ok" | "denied" | "unsupported" | "error";

export async function enablePush(spots: PushSpot[], lang: "ar" | "en"): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  try {
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
    return (await send({ subscription: sub.toJSON(), spots, lang })) ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function updatePushSpots(spots: PushSpot[], lang: "ar" | "en"): Promise<boolean> {
  const sub = await currentSubscription();
  return sub ? send({ subscription: sub.toJSON(), spots, lang }) : false;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await send({ subscription: sub.toJSON(), unsubscribe: true });
  await sub.unsubscribe().catch(() => undefined);
}

/** Shows a local notification so the user can check that alerts reach them. */
export async function testNotification(lang: "ar" | "en"): Promise<boolean> {
  try {
    const reg = await registration();
    await reg.showNotification(lang === "ar" ? "وقفت المية — تجربة" : "The water has stopped — test", {
      body: lang === "ar" ? "هذا إشعار تجريبي. لو وصلك، إشعارات الوقفة شغّالة." : "This is a test. If you see it, waqfa alerts work.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "ft-test",
    });
    return true;
  } catch {
    return false;
  }
}
