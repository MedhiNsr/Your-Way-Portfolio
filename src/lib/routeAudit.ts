import { haversine, type Tunnel, type TunnelCategory, type TunnelProvenance } from "./tunnels";

export type OsmTags = Record<string, string>;

export interface OsmTunnelObservation {
  osmId: number;
  coords: Array<[number, number]>;
  tags: OsmTags;
  lengthM: number;
}

export interface RouteAssociation {
  state: "ON_ROUTE" | "UNCERTAIN" | "OFF_ROUTE";
  minDistanceM: number;
  alignedRatio: number;
  routeIndex: number;
  distanceFromStartM: number;
}

const CONFIRMED_DISTANCE_M = 35;
const UNCERTAIN_DISTANCE_M = 65;
const MIN_ALIGNMENT_COS = Math.cos((40 * Math.PI) / 180);

function projectedPointToSegment(p: [number, number], a: [number, number], b: [number, number]): { distanceM: number; t: number } {
  const lat0 = ((p[0] + a[0] + b[0]) / 3) * (Math.PI / 180);
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos(lat0);
  const ax = a[1] * mLng, ay = a[0] * mLat, bx = b[1] * mLng, by = b[0] * mLat, px = p[1] * mLng, py = p[0] * mLat;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return { distanceM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

function alignmentCos(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): number {
  const lat0 = ((a[0] + b[0] + c[0] + d[0]) / 4) * (Math.PI / 180);
  const scaleLng = Math.cos(lat0);
  const ux = (b[1] - a[1]) * scaleLng, uy = b[0] - a[0], vx = (d[1] - c[1]) * scaleLng, vy = d[0] - c[0];
  const denom = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return denom ? Math.abs((ux * vx + uy * vy) / denom) : 0;
}

function sampleSegment(a: [number, number], b: [number, number]): Array<{ point: [number, number]; weightM: number }> {
  const lengthM = haversine(a, b);
  const count = Math.max(1, Math.ceil(lengthM / 20));
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 0.5) / count;
    return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], weightM: lengthM / count };
  });
}

export function associateGeometry(structure: Array<[number, number]>, route: Array<[number, number]>): RouteAssociation {
  if (structure.length < 2 || route.length < 2) return { state: "OFF_ROUTE", minDistanceM: Infinity, alignedRatio: 0, routeIndex: 0, distanceFromStartM: 0 };
  const routeCum = new Array<number>(route.length).fill(0);
  for (let i = 1; i < route.length; i++) routeCum[i] = routeCum[i - 1] + haversine(route[i - 1], route[i]);
  let totalLengthM = 0, alignedLengthM = 0, nearbyLengthM = 0, minDistanceM = Infinity, bestRouteIndex = 0, bestRouteT = 0;
  for (let i = 1; i < structure.length; i++) {
    for (const sample of sampleSegment(structure[i - 1], structure[i])) {
      totalLengthM += sample.weightM;
      let sampleDistanceM = Infinity, sampleAlignment = 0, sampleRouteIndex = 0, sampleRouteT = 0;
      for (let j = 1; j < route.length; j++) {
        const projected = projectedPointToSegment(sample.point, route[j - 1], route[j]);
        if (projected.distanceM < sampleDistanceM) {
          sampleDistanceM = projected.distanceM;
          sampleAlignment = alignmentCos(structure[i - 1], structure[i], route[j - 1], route[j]);
          sampleRouteIndex = j - 1;
          sampleRouteT = projected.t;
        }
      }
      if (sampleDistanceM < minDistanceM) { minDistanceM = sampleDistanceM; bestRouteIndex = sampleRouteIndex; bestRouteT = sampleRouteT; }
      if (sampleDistanceM <= UNCERTAIN_DISTANCE_M) nearbyLengthM += sample.weightM;
      if (sampleDistanceM <= CONFIRMED_DISTANCE_M && sampleAlignment >= MIN_ALIGNMENT_COS) alignedLengthM += sample.weightM;
    }
  }
  const alignedRatio = totalLengthM ? alignedLengthM / totalLengthM : 0;
  const nearbyRatio = totalLengthM ? nearbyLengthM / totalLengthM : 0;
  const enoughAlignedLength = alignedLengthM >= Math.min(30, totalLengthM * 0.6);
  const state = minDistanceM <= CONFIRMED_DISTANCE_M && alignedRatio >= 0.35 && enoughAlignedLength ? "ON_ROUTE" : minDistanceM <= UNCERTAIN_DISTANCE_M && nearbyRatio >= 0.15 ? "UNCERTAIN" : "OFF_ROUTE";
  const segmentLength = haversine(route[bestRouteIndex], route[bestRouteIndex + 1]);
  return { state, minDistanceM, alignedRatio, routeIndex: bestRouteIndex, distanceFromStartM: routeCum[bestRouteIndex] + bestRouteT * segmentLength };
}

export function classifyOsmTags(tags: OsmTags): TunnelCategory {
  const tunnel = tags.tunnel?.toLowerCase(), covered = tags.covered?.toLowerCase();
  if (tunnel === "building_passage") return "INCERTAIN";
  if (tunnel === "yes") return "TUNNEL";
  if (covered === "yes" && !tunnel) return "TRANCHEE_COUVERTE";
  return "INCERTAIN";
}

export function preferredOsmName(tags: OsmTags): string | null { return tags.official_name || tags.name || tags.alt_name || tags.ref || null; }

export function canClaimVerifiedTunnelFree(input: { graphHopperAnalyzed: boolean; overpassSucceeded?: boolean; cartographyVerified?: boolean; tunnels: Tunnel[] }): boolean {
  return input.graphHopperAnalyzed && Boolean(input.cartographyVerified ?? input.overpassSucceeded) && input.tunnels.length === 0;
}

function categoryLabel(category: TunnelCategory): string { return category === "TUNNEL" ? "Tunnel" : category === "TRANCHEE_COUVERTE" ? "Tranchée couverte" : "Ouvrage couvert"; }
export function fallbackTunnelName(category: TunnelCategory, roadName: string | null | undefined, lengthM: number): string {
  const road = roadName ? ` — ${roadName}` : "";
  return `${categoryLabel(category)} non nommé${road} — env. ${Math.max(1, Math.round(lengthM / 10) * 10).toLocaleString("fr-FR")} m`;
}
function provenanceOf(tunnel: Tunnel): TunnelProvenance { return tunnel.provenance ?? "GraphHopper"; }
function osmTypeLabel(category: TunnelCategory): Tunnel["type"] { return category === "TUNNEL" ? "Tunnel fermé" : category === "TRANCHEE_COUVERTE" ? "Passage couvert" : "Type inconnu"; }
function overlapsTunnel(a: Tunnel, observation: OsmTunnelObservation): boolean { return associateGeometry(observation.coords, a.coords).state === "ON_ROUTE"; }
function normalizeIdentity(value: string | null | undefined): string { return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function tunnelIdentity(tunnel: Tunnel): string { return normalizeIdentity(tunnel.roadName || tunnel.osmTags?.official_name || tunnel.osmTags?.name || tunnel.osmTags?.ref); }
function endpointGapM(a: Tunnel, b: Tunnel): number { const aEnd = a.coords[a.coords.length - 1], bStart = b.coords[0]; return !aEnd || !bStart ? Infinity : haversine(aEnd, bStart); }

export function mergeAdjacentTunnelSegments(tunnels: Tunnel[]): Tunnel[] {
  const sorted = [...tunnels].sort((a, b) => a.distanceFromStartM - b.distanceFromStartM), result: Tunnel[] = [];
  for (const current of sorted) {
    const previous = result[result.length - 1];
    if (!previous) { result.push({ ...current }); continue; }
    const previousIdentity = tunnelIdentity(previous), currentIdentity = tunnelIdentity(current);
    const sameCategory = previous.category === current.category;
    const routeGapM = current.distanceFromStartM - (previous.distanceFromStartM + previous.lengthM), geometryGapM = endpointGapM(previous, current);
    const sameNamedStructure = Boolean(previousIdentity) && previousIdentity === currentIdentity && routeGapM <= 90 && geometryGapM <= 140;
    const contiguousUnnamedStructure = !previousIdentity && !currentIdentity && routeGapM <= 25 && geometryGapM <= 35;
    if (!sameCategory || (!sameNamedStructure && !contiguousUnnamedStructure)) { result.push({ ...current }); continue; }
    previous.lengthM += current.lengthM;
    previous.traversalSec += current.traversalSec;
    previous.coords = [...previous.coords, ...current.coords];
    previous.toIdx = Math.max(previous.toIdx, current.toIdx);
    previous.sources = Array.from(new Set([...(previous.sources ?? []), ...(current.sources ?? [])]));
    previous.evidence = [...(previous.evidence ?? []), ...(current.evidence ?? [])];
    previous.identificationConfidence = previous.identificationConfidence === "low" || current.identificationConfidence === "low" ? "low" : previous.identificationConfidence ?? current.identificationConfidence;
    if (!previous.roadName && current.roadName) previous.roadName = current.roadName;
    if (previous.name.includes("non nommé") && !current.name.includes("non nommé")) previous.name = current.name;
  }
  return result;
}

export function mergeTunnelObservations(graphHopperTunnels: Tunnel[], observations: OsmTunnelObservation[], routeCoords: Array<[number, number]>, totalDurationSec: number, osmSource: "OSM local" | "OSM/Overpass" = "OSM/Overpass"): { tunnels: Tunnel[]; uncertainCount: number } {
  const merged = graphHopperTunnels.map((tunnel) => ({ ...tunnel, category: tunnel.category ?? (tunnel.isClosed ? "TUNNEL" : "TRANCHEE_COUVERTE"), provenance: provenanceOf(tunnel), sources: tunnel.sources ?? (["GraphHopper"] as const), lengthSource: tunnel.lengthSource ?? ("GraphHopper" as const) }));
  const routeLengthM = routeCoords.slice(1).reduce((sum, point, index) => sum + haversine(routeCoords[index], point), 0);
  let uncertainCount = 0;
  for (const observation of observations) {
    const association = associateGeometry(observation.coords, routeCoords);
    // A nearby structure is not a tunnel travelled by the user. Keep it only
    // as uncertainty metadata; never put it in the displayed/countable list.
    if (association.state !== "ON_ROUTE") {
      if (association.state === "UNCERTAIN") uncertainCount += 1;
      continue;
    }
    const category = classifyOsmTags(observation.tags), osmName = preferredOsmName(observation.tags), roadName = observation.tags.ref || observation.tags.name || null;
    const existing = merged.find((tunnel) => overlapsTunnel(tunnel, observation));
    if (existing) {
      existing.provenance = `GraphHopper + ${osmSource}`;
      existing.sources = ["GraphHopper", osmSource];
      existing.evidence = [...(existing.evidence ?? [{ source: "GraphHopper" as const, name: existing.name, lengthM: existing.lengthM }]), { source: osmSource, externalId: String(observation.osmId), name: osmName, lengthM: observation.lengthM }];
      existing.identificationConfidence = "high";
      existing.osmTags = { ...observation.tags }; existing.osmId = observation.osmId; existing.association = "ON_ROUTE";
      if (osmName) existing.name = osmName;
      existing.category = category; existing.type = osmTypeLabel(category); existing.isClosed = category === "TUNNEL";
      if (!existing.roadName && observation.tags.ref) existing.roadName = observation.tags.ref;
      continue;
    }
    const ratio = association.distanceFromStartM / Math.max(routeLengthM, 1), name = osmName ?? fallbackTunnelName(category, roadName, observation.lengthM);
    merged.push({ name, type: osmTypeLabel(category), category, isClosed: category === "TUNNEL", lengthM: observation.lengthM, traversalSec: observation.lengthM / ((70 * 1000) / 3600), position: ratio < 0.2 ? "Près du départ" : ratio > 0.8 ? "Près de l'arrivée" : "Au milieu du trajet", fromIdx: association.routeIndex, toIdx: association.routeIndex + 1, coords: observation.coords, timeFromStartSec: ratio * totalDurationSec, distanceFromStartM: association.distanceFromStartM, roadName, provenance: osmSource, sources: [osmSource], evidence: [{ source: osmSource, externalId: String(observation.osmId), name: osmName, lengthM: observation.lengthM }], identificationConfidence: "medium", lengthSource: osmSource, osmTags: { ...observation.tags }, osmId: observation.osmId, association: "ON_ROUTE" });
  }
  const consolidated = mergeAdjacentTunnelSegments(merged);
  return { tunnels: consolidated, uncertainCount };
}
