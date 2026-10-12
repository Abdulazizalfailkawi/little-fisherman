// Device GPS — only requested when the user taps a GPS button.
export function getGps(): Promise<{ lat: number; lng: number }> {
  return new Promise((res, rej) => {
    if (!("geolocation" in navigator)) return rej(new Error("NO_GPS"));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }),
      (e) => rej(new Error(e.code === 1 ? "DENIED" : "UNAVAILABLE")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
