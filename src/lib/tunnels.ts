export type ComfortScore = "very" | "good" | "moderate" | "difficult" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type Certainty = "high" | "medium" | "low";
export type GeoRisk = "low" | "medium" | "high";
export type VerificationStatus = "VERIFIED" | "PARTIAL" | "FAILED";
export type TunnelCategory = "TUNNEL" | "TRANCHEE_COUVERTE" | "INCERTAIN";
export type TunnelSource = "GraphHopper" | "OSM local" | "OSM/Overpass" | "Wikidata" | "CETU";
export type TunnelProvenance = string;
export interface TunnelEvidence {
  source: TunnelSource;
  externalId?: string;
  name?: string | null;
  lengthM?: number | null;
  details?: Record<string, string | number | null>;
}
export type OverpassVerificationState =
  | "verification_success_no_tunnel"
  | "verification_success_tunnel_found"
  | "verification_partial"
  | "verification_failed";

export interface RouteVerificationDebug {
  source: "local_osm" | "overpass_osm";
  localOsmStatus?: "verified" | "partial" | "unavailable";
  localSnapshotId?: string | null;
  localCandidatesExamined?: number;
  localQueryMs?: number;
  overpassStatus: OverpassVerificationState | "not_run";
  retryCount: number;
  failureReason: string | null;
  riskZoneDowngradeApplied: boolean;
  tunnelFreeDowngraded: boolean;
}

export interface RouteCertaintyDebug {
  confidence: Confidence;
  geoRisk: GeoRisk;
  coveredCount: number;
  suspectedAreaCount: number;
  tunnelCount: number;
  resultingCertainty: Certainty;
}

export interface RouteDebugInfo {
  verification: RouteVerificationDebug;
  certainty: RouteCertaintyDebug;
}

export interface Tunnel {
  name: string;
  type: "Tunnel fermé" | "Passage couvert" | "Type inconnu";
  isClosed: boolean;
  lengthM: number;
  traversalSec: number;
  position: "Près du départ" | "Au milieu du trajet" | "Près de l'arrivée";
  fromIdx: number;
  toIdx: number;
  coords: Array<[number, number]>;
  timeFromStartSec: number;
  distanceFromStartM: number;
  roadName?: string | null;
  tunnelKey?: string;
  category?: TunnelCategory;
  provenance?: TunnelProvenance;
  osmId?: number;
  osmTags?: Record<string, string>;
  association?: "ON_ROUTE" | "UNCERTAIN";
  sources?: TunnelSource[];
  evidence?: TunnelEvidence[];
  identificationConfidence?: Confidence | "very_high";
  lengthSource?: TunnelSource | "geometry";
}

export interface AnalyzedRoute {
  label: string;
  distanceM: number;
  durationSec: number;
  coords: Array<[number, number]>;
  tunnels: Tunnel[];
  comfort: ComfortScore;
  confidence: Confidence;
  totalTunnelM: number;
  longestTunnelM: number;
  longestTunnelSec: number;
  totalTunnelSec: number;
  closedTunnelCount: number;
  coveredCount: number;
  suspectedAreaCount: number;
  geoRisk: GeoRisk;
  certainty: Certainty;
  certaintyReasons: string[];
  trulyTunnelFree: boolean;
  verificationStatus: VerificationStatus;
  verificationFailureReason?: string | null;
  debug: RouteDebugInfo;
}

const R = 6371000;
export function haversine(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function scoreRoute(tunnels: Tunnel[]): ComfortScore {
  if (tunnels.length === 0) return "very";
  const longest = Math.max(...tunnels.map((t) => t.lengthM));
  const total = tunnels.reduce((s, t) => s + t.lengthM, 0);
  const longestSec = Math.max(...tunnels.map((t) => t.traversalSec));
  if (longest > 800 || total > 1500) return "difficult";
  if (longest >= 150) return "moderate";
  if (longest < 150 && longestSec < 15) return "good";
  return "moderate";
}

export const comfortLabel: Record<ComfortScore, string> = {
  very: "Tout doux",
  good: "Tranquille",
  moderate: "Quelques tunnels",
  difficult: "Plusieurs tunnels",
  unknown: "À découvrir",
};

export const comfortBlurb: Record<ComfortScore, string> = {
  very: "Aucun tunnel identifié par les sources actuellement vérifiées.",
  good: "Juste quelques tout petits tunnels. Tu ne devrais même pas les remarquer.",
  moderate:
    "Il y a quelques tunnels sur la route. Your Way te les montre un par un, à l'avance, pour qu'aucun ne te surprenne.",
  difficult:
    "Ce trajet passe par plusieurs tunnels. Pas d'inquiétude — tu vois tout à l'avance : où ils sont, leur longueur, et combien de temps tu y restes.",
  unknown: "Your Way n'a pas toutes les infos sur les tunnels pour ce trajet.",
};

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

export function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm.toString().padStart(2, "0")}` : `${h} h`;
}

export function formatShortTime(sec: number) {
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${Math.round(sec / 60)} min`;
}

/**
 * Generate calm, reassuring contextual messages about the route's tunnels (FR).
 */
export function reassuranceMessages(route: AnalyzedRoute): string[] {
  const msgs: string[] = [];
  const { tunnels, durationSec } = route;
  if (tunnels.length === 0) return msgs;

  const shortCount = tunnels.filter((t) => t.lengthM < 300).length;
  if (tunnels.length >= 2 && shortCount / tunnels.length >= 0.6) {
    msgs.push("La plupart des sections en tunnel sont courtes.");
  }

  const longest = tunnels.reduce((a, b) => (a.lengthM > b.lengthM ? a : b));
  if (longest.lengthM >= 300) {
    const ratio = longest.timeFromStartSec / Math.max(durationSec, 1);
    const when =
      ratio < 0.25
        ? "près du début du trajet"
        : ratio > 0.75
          ? "près de l'arrivée"
          : `après ${formatDuration(longest.timeFromStartSec)} de conduite`;
    msgs.push(`Le tunnel le plus long apparaît ${when}.`);
  }

  if (tunnels.length >= 3) {
    const positions = tunnels.map((t) => t.timeFromStartSec / Math.max(durationSec, 1));
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    if (max - min < 0.25) {
      const mid = (min + max) / 2;
      const zone =
        mid < 0.33
          ? "en début de trajet"
          : mid > 0.66
            ? "vers la fin du trajet"
            : "vers le milieu du trajet";
      msgs.push(`Les tunnels sont surtout regroupés ${zone}.`);
    }
  }

  return msgs;
}
