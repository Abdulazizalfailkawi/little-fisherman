"use client";

// Map pin selection with Leaflet + OpenStreetMap tiles (attribution shown).
// Tap the map to drop / move the pin. Coordinates stay on the device and in
// your private database; the map tiles only receive the visible area.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, CircleMarker } from "leaflet";

export function MapPicker({
  value,
  onChange,
  center,
  zoom = 11,
  height = 260,
  readOnly = false,
  markers = [],
}: {
  value: { lat: number; lng: number } | null;
  onChange?: (v: { lat: number; lng: number }) => void;
  center?: { lat: number; lng: number; zoom?: number } | null;
  zoom?: number;
  height?: number;
  readOnly?: boolean;
  markers?: { lat: number; lng: number; label?: string }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const pin = useRef<CircleMarker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !el.current || map.current) return;
      const start = value ?? center ?? { lat: 29.3, lng: 48.0 };
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 13 : (center?.zoom ?? zoom));
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      for (const mk of markers) {
        L.circleMarker([mk.lat, mk.lng], { radius: 6, color: "#7fb6f0", fillOpacity: 0.8 }).addTo(m).bindTooltip(mk.label ?? "");
      }
      if (value) pin.current = L.circleMarker([value.lat, value.lng], { radius: 9, color: "#7fb6f0", weight: 3, fillOpacity: 0.6 }).addTo(m);
      if (!readOnly)
        m.on("click", (e) => {
          const lat = Math.round(e.latlng.lat * 1e5) / 1e5;
          const lng = Math.round(e.latlng.lng * 1e5) / 1e5;
          if (pin.current) pin.current.setLatLng([lat, lng]);
          else pin.current = L.circleMarker([lat, lng], { radius: 9, color: "#7fb6f0", weight: 3, fillOpacity: 0.6 }).addTo(m);
          cb.current?.({ lat, lng });
        });
      map.current = m;
      setTimeout(() => m.invalidateSize(), 50);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync with external changes (GPS, typed coordinates).
  useEffect(() => {
    (async () => {
      if (!map.current) return;
      const L = (await import("leaflet")).default;
      if (!value) {
        pin.current?.remove();
        pin.current = null;
        return;
      }
      if (pin.current) pin.current.setLatLng([value.lat, value.lng]);
      else pin.current = L.circleMarker([value.lat, value.lng], { radius: 9, color: "#7fb6f0", weight: 3, fillOpacity: 0.6 }).addTo(map.current);
      map.current.panTo([value.lat, value.lng]);
    })();
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (center && map.current && !value) map.current.setView([center.lat, center.lng], center.zoom ?? 12);
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} style={{ height }} className="isolate z-0 w-full overflow-hidden rounded-xl border border-line" dir="ltr" />;
}
