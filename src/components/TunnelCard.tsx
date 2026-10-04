import type { Tunnel } from "@/lib/tunnels";
import { formatDistance, formatShortTime } from "@/lib/tunnels";

export function TunnelCard({ tunnel, index }: { tunnel: Tunnel; index: number }) {
  const category =
    tunnel.category === "TRANCHEE_COUVERTE"
      ? "Tranchée couverte"
      : tunnel.category === "TUNNEL"
        ? "Tunnel"
        : tunnel.category === "INCERTAIN"
          ? "Incertain"
          : "Galerie / ouvrage couvert";
  const confidence =
    tunnel.identificationConfidence === "very_high"
      ? "Très élevée"
      : tunnel.identificationConfidence === "high"
        ? "Élevée"
        : tunnel.identificationConfidence === "medium"
          ? "Moyenne"
          : "Faible";
  const sourceText = tunnel.sources?.join(" + ") ?? tunnel.provenance;
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Tunnel {index + 1}          </div>
          <div className="font-medium">{tunnel.name}</div>
          {sourceText && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {tunnel.sources?.length === 1 && tunnel.sources[0] === "GraphHopper"
                ? "Détecté uniquement par GraphHopper — identification non confirmée"
                : `Confirmé par ${sourceText}`}
            </div>
          )}
        </div>
        <span className="text-xs rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
          {category}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Longueur</dt>
          <dd>≈ {formatDistance(tunnel.lengthM)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Temps à l'intérieur</dt>
          <dd>≈ {formatShortTime(tunnel.traversalSec)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Position</dt>
          <dd>{tunnel.position}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Confiance d’identification</dt>
          <dd>{confidence}</dd>
        </div>
      </dl>
    </div>
  );
}
