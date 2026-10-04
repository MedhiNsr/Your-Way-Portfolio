import type { Tunnel } from "@/lib/tunnels";
import { formatDistance, formatDuration } from "@/lib/tunnels";

interface Props {
  durationSec: number;
  tunnels: Tunnel[];
  onTunnelClick?: (index: number) => void;
  activeIndex?: number | null;
}

export function RouteTimeline({ durationSec, tunnels, onTunnelClick, activeIndex }: Props) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Chronologie du trajet</h3>
        <span className="text-xs text-muted-foreground">{formatDuration(durationSec)}</span>
      </div>

      <div className="relative mt-5 mb-2 h-2 rounded-full bg-secondary">
        {tunnels.map((t, i) => {
          const ratio = Math.max(
            0,
            Math.min(1, t.timeFromStartSec / Math.max(durationSec, 1)),
          );
          const width = Math.max(
            2,
            Math.min(20, (t.traversalSec / Math.max(durationSec, 1)) * 100),
          );
          return (
            <button
              key={i}
              type="button"
              onClick={() => onTunnelClick?.(i)}
              title={`Tunnel ${i + 1} : ${t.name}`}
              className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full transition ${
                activeIndex === i ? "ring-2 ring-foreground/40" : ""
              }`}
              style={{
                left: `${ratio * 100}%`,
                width: `${width}%`,
                background: "#e0a458",
              }}
            />
          );
        })}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 size-3 rounded-full bg-primary border-2 border-card" />
        <span className="absolute -right-1 top-1/2 -translate-y-1/2 size-3 rounded-full bg-foreground/80 border-2 border-card" />
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
        <span>Départ</span>
        <span>Arrivée</span>
      </div>

      {tunnels.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          {tunnels.map((t, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-foreground/80">
                <span className="inline-block size-1.5 rounded-full bg-[#e0a458] mr-2 align-middle" />
                Tunnel {i + 1} · {t.name}
              </span>
              <span>
                après {formatDuration(t.timeFromStartSec)} · {formatDistance(t.lengthM)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
