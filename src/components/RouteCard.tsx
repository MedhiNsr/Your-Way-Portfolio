import type { AnalyzedRoute } from "@/lib/tunnels";
import { formatDistance, formatDuration, formatShortTime } from "@/lib/tunnels";
import { ComfortBadge } from "./ComfortBadge";

interface Props {
  route: AnalyzedRoute;
  recommended?: boolean;
  onSelect?: () => void;
  selected?: boolean;
  showPreferenceBadge?: boolean;
  matchesPreferences?: boolean;
}

export function RouteCard({
  route,
  recommended,
  onSelect,
  selected,
  showPreferenceBadge,
  matchesPreferences,
}: Props) {
  const trustBadge = verificationBadge(route);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-2xl bg-card border p-4 shadow-soft transition ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border/60 hover:border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {recommended && (
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">
              Recommandé
            </div>
          )}
          <div className="font-medium">{route.label}</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {formatDistance(route.distanceM)} · {formatDuration(route.durationSec)}
          </div>
          <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${trustBadge.className}`}>
            {trustBadge.label}
          </div>
          {showPreferenceBadge && (
            <div
              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                matchesPreferences
                  ? "bg-[var(--color-comfort-very)]/40 text-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {matchesPreferences
                ? "Respecte tes préférences"
                : "Ne respecte pas tes préférences"}
            </div>
          )}
        </div>
        <ComfortBadge score={route.comfort} size="sm" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Tunnels" value={String(route.tunnels.length)} />
        <Stat
          label="Plus long"
          value={route.longestTunnelM ? formatDistance(route.longestTunnelM) : "—"}
        />
        <Stat
          label="Temps dedans"
          value={route.totalTunnelSec ? formatShortTime(route.totalTunnelSec) : "—"}
        />
      </div>

      {route.tunnels.length === 0 && (
        <p className="mt-3 text-xs text-foreground/70">
          {route.verificationStatus === "FAILED"
            ? "Impossible de confirmer l'absence de tunnel sur ce trajet."
            : "Aucun tunnel confirmé avec les données actuellement vérifiées."}
        </p>
      )}
      {route.verificationStatus === "FAILED" && (
        <p className="mt-2 text-xs text-foreground/75">
          La vérification cartographique n’a pas pu être finalisée. Ce trajet ne peut donc pas être confirmé comme sans tunnel.
        </p>
      )}
      {route.tunnels.length > 0 && route.closedTunnelCount === 0 && (
        <p className="mt-3 text-xs text-foreground/70">
          Uniquement des passages couverts ou ouverts.
        </p>
      )}
    </button>
  );
}

function verificationBadge(route: AnalyzedRoute): { label: string; className: string } {
  if (route.verificationStatus === "VERIFIED") {
    return {
      label: "Vérifié",
      className: "bg-[var(--color-comfort-very)]/45 text-foreground",
    };
  }
  if (route.verificationStatus === "FAILED") {
    return {
      label: "Vérification impossible",
      className: "bg-[var(--color-comfort-moderate)]/35 text-foreground",
    };
  }
  return {
    label: "Vérification partielle",
    className: "bg-secondary text-foreground/85",
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}
