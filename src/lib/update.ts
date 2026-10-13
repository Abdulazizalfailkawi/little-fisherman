// "Is there a newer version of the app?" — compares the build id baked into
// this page with the one the server is currently serving.

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export type UpdateCheck = "available" | "latest" | "offline";

export async function checkForUpdate(): Promise<UpdateCheck> {
  try {
    const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return "offline";
    const { id } = (await r.json()) as { id?: string };
    if (id && id !== BUILD_ID) return "available";
    return "latest";
  } catch {
    return "offline";
  }
}

/** Fetches the newest files into the offline cache, then reloads into them. */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.active?.postMessage("warm");
  } catch {}
  location.reload();
}
