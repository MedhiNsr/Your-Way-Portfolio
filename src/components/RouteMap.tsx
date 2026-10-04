import { useEffect, useRef, useState } from "react";
import type { Tunnel } from "@/lib/tunnels";
import { formatDistance, formatShortTime } from "@/lib/tunnels";

interface Props {
  coords: Array<[number, number]>;
  tunnels?: Tunnel[];
  height?: number;
  onTunnelClick?: (index: number) => void;
  /** External focus request — recenter map on this tunnel. */
  focusTunnelIndex?: number | null;
}

export function RouteMap({
  coords,
  tunnels = [],
  height = 260,
  onTunnelClick,
  focusTunnelIndex,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tunnelLayerRefs = useRef<Array<{ marker: unknown; line: unknown }>>([]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ref.current || coords.length === 0) return;
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !ref.current) return;

      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
      }
      const map = L.map(ref.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        dragging: true,
        doubleClickZoom: true,
        touchZoom: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const poly = L.polyline(coords, {
        color: "#5a8a70",
        weight: 5,
        opacity: 0.9,
      }).addTo(map);

      // Start + end markers
      const dot = (color: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
      L.marker(coords[0], { icon: dot("#5a8a70") }).addTo(map).bindTooltip("Départ");
      L.marker(coords[coords.length - 1], { icon: dot("#3a4d5c") })
        .addTo(map)
        .bindTooltip("Arrivée");

      // Tunnel highlights + markers
      tunnelLayerRefs.current = [];
      tunnels.forEach((t, i) => {
        const line = L.polyline(t.coords, {
          color: "#e0a458",
          weight: 7,
          opacity: 0.85,
          lineCap: "round",
        }).addTo(map);

        const mid = t.coords[Math.floor(t.coords.length / 2)];
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#e0a458;color:white;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25)">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker(mid, { icon }).addTo(map);
        const popupHtml = `
          <div style="font-family:inherit;min-width:180px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7a7a7a">Tunnel ${i + 1}</div>
            <div style="font-weight:600;margin-top:2px">${escapeHtml(t.name)}</div>
            <div style="margin-top:6px;font-size:13px;color:#444">
              <div>Longueur ≈ ${formatDistance(t.lengthM)}</div>
              <div>À l'intérieur ≈ ${formatShortTime(t.traversalSec)}</div>
              <div style="margin-top:2px;color:#777">${t.type}</div>
            </div>
          </div>
        `;
        marker.bindPopup(popupHtml);
        marker.on("click", () => onTunnelClick?.(i));
        line.on("click", () => {
          marker.openPopup();
          onTunnelClick?.(i);
        });
        tunnelLayerRefs.current.push({ marker, line });
      });

      map.fitBounds(poly.getBounds(), { padding: [24, 24] });
      // Slight delay so layout settles (important for fullscreen)
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, [coords, tunnels, onTunnelClick, fullscreen]);

  // Focus a tunnel externally
  useEffect(() => {
    if (focusTunnelIndex == null) return;
    const map = mapRef.current as
      | { setView: (c: [number, number], z: number) => void }
      | null;
    const entry = tunnelLayerRefs.current[focusTunnelIndex];
    const t = tunnels[focusTunnelIndex];
    if (!map || !entry || !t) return;
    const mid = t.coords[Math.floor(t.coords.length / 2)];
    map.setView(mid, 14);
    (entry.marker as { openPopup: () => void }).openPopup();
  }, [focusTunnelIndex, tunnels]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-background p-3 flex flex-col gap-2"
          : "relative"
      }
    >
      <div
        ref={ref}
        className="rounded-2xl overflow-hidden border border-border/60 z-0"
        style={{ height: fullscreen ? "100%" : height, flex: fullscreen ? 1 : undefined }}
      />
      <button
        type="button"
        onClick={() => setFullscreen((f) => !f)}
        className={`${
          fullscreen ? "self-end" : "absolute top-3 right-3 z-10"
        } rounded-full bg-card/95 backdrop-blur border border-border px-3 py-1.5 text-xs font-medium shadow-soft hover:bg-card`}
        aria-label={fullscreen ? "Fermer le plein écran" : "Ouvrir en plein écran"}
      >
        {fullscreen ? "Fermer" : "Plein écran"}
      </button>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
