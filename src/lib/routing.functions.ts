import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  haversine,
  scoreRoute,
  type AnalyzedRoute,
  type Certainty,
  type Confidence,
  type GeoRisk,
  type Tunnel,
} from "./tunnels";
import { routePassesStrict, type Preferences } from "./preferences";
import { makeTunnelKey } from "./tunnelKey";
import {
  associateGeometry,
  canClaimVerifiedTunnelFree,
  fallbackTunnelName,
  mergeTunnelObservations,
  type OsmTunnelObservation,
} from "./routeAudit";
import {
  auditOverpassZones,
  buildOverpassZones,
  type LocalOverpassAuditResult,
  type OverpassZone,
  type ZoneQueryContext,
  type ZoneQueryResult,
} from "./overpassAudit";
import { enrichTunnels, fetchWikidataEnrichment } from "./tunnelEnrichment";
import {
  localTunnelRepository,
  unavailableLocalTunnelRepository,
  type LocalTunnelQuery,
} from "./localTunnelRepository";

// ---------------------------------------------------------------------------
// Geographic risk: regions where OSM tunnel/covered tagging is known to be
// incomplete (coastal galleries, mountain shelters, snow sheds, arcades…).
// Routes touching these regions can NEVER be certified high-certainty
// "tunnel-free" without manual validation.
// ---------------------------------------------------------------------------
interface RiskZone {
  name: string;
  s: number;
  w: number;
  n: number;
  e: number;
  level: GeoRisk;
}
const RISK_ZONES: RiskZone[] = [
  // Italian Riviera / Liguria coast (Ventimiglia → La Spezia): countless
  // coastal galleries, semi-covered cliff roads, unmapped short tunnels.
  { name: "Liguria coast", s: 43.75, w: 7.5, n: 44.4, e: 10.0, level: "high" },
  // French Riviera & Monaco (Menton, Monaco, Èze, Nice corniches): coastal
  // tunnels and galleries densely packed, OSM coverage variable.
  { name: "Côte d'Azur / Monaco", s: 43.55, w: 6.8, n: 43.95, e: 7.6, level: "high" },
  // Northern Alps & Pyrenees passes: avalanche galleries, snow sheds.
  { name: "Alpes françaises", s: 44.5, w: 5.5, n: 46.5, e: 7.5, level: "medium" },
  { name: "Pyrénées", s: 42.3, w: -1.8, n: 43.2, e: 3.2, level: "medium" },
];

function assessGeoRisk(coords: Array<[number, number]>): {
  risk: GeoRisk;
  zones: string[];
} {
  const zones: string[] = [];
  let level: GeoRisk = "low";
  const step = Math.max(1, Math.floor(coords.length / 200));
  for (let i = 0; i < coords.length; i += step) {
    const [lat, lng] = coords[i];
    for (const z of RISK_ZONES) {
      if (lat >= z.s && lat <= z.n && lng >= z.w && lng <= z.e) {
        if (!zones.includes(z.name)) zones.push(z.name);
        if (z.level === "high") level = "high";
        else if (z.level === "medium" && level !== "high") level = "medium";
      }
    }
  }
  return { risk: level, zones };
}

function computeCertainty(input: {
  tunnels: Tunnel[];
  coveredCount: number;
  suspectedAreaCount: number;
  geoRisk: GeoRisk;
  confidence: Confidence;
}): { certainty: Certainty; reasons: string[] } {
  const reasons: string[] = [];
  let level: Certainty = "high";
  const cap = (l: Certainty) => {
    const order: Certainty[] = ["high", "medium", "low"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
  };
  if (input.confidence === "medium") {
    cap("medium");
    reasons.push("Données cartographiques partiellement détaillées sur ce trajet.");
  }
  if (input.confidence === "low") {
    cap("low");
    reasons.push("Données de type de route limitées pour ce trajet.");
  }
  if (input.coveredCount > 0) {
    cap("medium");
    reasons.push("Présence de sections couvertes détectées.");
  }
  if (input.suspectedAreaCount > 0) {
    cap("medium");
    reasons.push(
      `${input.suspectedAreaCount} zone(s) potentiellement couverte(s) repérée(s) sur la carte (galerie, passage couvert ou tunnel court non confirmé).`,
    );
  }
  if (input.geoRisk === "medium") {
    cap("medium");
    reasons.push("Région où certaines galeries de montagne peuvent ne pas être cartographiées.");
  }
  if (input.geoRisk === "high") {
    cap("low");
    reasons.push(
      "Région côtière ou alpine connue pour des galeries et passages couverts mal cartographiés.",
    );
  }
  return { certainty: level, reasons };
}

const GH_BASE = "https://graphhopper.com/api/1";

interface GeocodeHit {
  point: { lat: number; lng: number };
  name?: string;
  country?: string;
  state?: string;
  city?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
}

function formatHit(h: GeocodeHit): string {
  const parts = [
    [h.housenumber, h.street].filter(Boolean).join(" ") || h.name,
    h.postcode,
    h.city,
    h.state,
    h.country,
  ].filter(Boolean) as string[];
  return parts.filter((p, i) => p !== parts[i - 1]).join(", ");
}

async function geocodeOne(query: string, key: string): Promise<GeocodeHit> {
  const url = `${GH_BASE}/geocode?q=${encodeURIComponent(query)}&limit=1&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Échec du géocodage (${res.status})`);
  const data = (await res.json()) as { hits?: GeocodeHit[] };
  if (!data.hits?.length) throw new Error(`Adresse introuvable : ${query}`);
  return data.hits[0];
}

export const suggestAddresses = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ q: z.string().min(2).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const key = process.env.GRAPHHOPPER_API_KEY;
    if (!key) return { suggestions: [] as Array<{ label: string }> };
    try {
      const url = `${GH_BASE}/geocode?q=${encodeURIComponent(data.q)}&limit=5&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return { suggestions: [] };
      const json = (await res.json()) as { hits?: GeocodeHit[] };
      const suggestions = (json.hits ?? [])
        .map((h) => ({ label: formatHit(h) }))
        .filter((s) => s.label.length > 0);
      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  });

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.GRAPHHOPPER_API_KEY;
    if (!key) return { label: null as string | null };
    try {
      const url = `${GH_BASE}/geocode?reverse=true&point=${data.lat},${data.lng}&limit=1&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return { label: null };
      const json = (await res.json()) as { hits?: GeocodeHit[] };
      const hit = json.hits?.[0];
      if (!hit) return { label: null };
      return { label: formatHit(hit) };
    } catch {
      return { label: null };
    }
  });

interface GHPath {
  distance: number;
  time: number;
  points: { coordinates: Array<[number, number]> };
  details?: {
    road_environment?: Array<[number, number, string]>;
    street_name?: Array<[number, number, string]>;
    max_speed?: Array<[number, number, number]>;
    road_class?: Array<[number, number, string]>;
  };
}

function defaultSpeedFor(roadClass?: string): number | undefined {
  if (!roadClass) return undefined;
  if (["motorway", "trunk"].includes(roadClass)) return 100;
  if (["primary", "secondary"].includes(roadClass)) return 70;
  if (["residential", "living_street", "service"].includes(roadClass)) return 40;
  return 70;
}

function extractTunnels(
  path: GHPath,
  totalDurationSec: number,
): { tunnels: Tunnel[]; confidence: Confidence } {
  const coords: Array<[number, number]> = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
  const re = path.details?.road_environment;
  if (!re) return { tunnels: [], confidence: "low" };

  const cum: number[] = new Array(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
  }
  const totalDist = cum[cum.length - 1] || 1;

  const names = path.details?.street_name ?? [];
  const speeds = path.details?.max_speed ?? [];
  const classes = path.details?.road_class ?? [];

  const findAt = <T>(arr: Array<[number, number, T]>, idx: number): T | undefined => {
    for (const [a, b, v] of arr) if (idx >= a && idx < b) return v;
    return undefined;
  };

  const tunnels: Tunnel[] = [];
  for (const [from, to, env] of re) {
    const isTunnel = env === "tunnel";
    if (!isTunnel && env !== "covered") continue;

    const seg = coords.slice(from, to + 1);
    if (seg.length < 2) continue;
    let lengthM = 0;
    for (let i = 1; i < seg.length; i++) lengthM += haversine(seg[i - 1], seg[i]);

    const speedKmh = findAt(speeds, from) ?? defaultSpeedFor(findAt(classes, from)) ?? 70;
    const traversalSec = lengthM / ((speedKmh * 1000) / 3600);

    const distFromStart = cum[from] ?? 0;
    const ratio = distFromStart / totalDist;
    const position =
      ratio < 0.2 ? "Près du départ" : ratio > 0.8 ? "Près de l'arrivée" : "Au milieu du trajet";

    const roadName = findAt(names, from) ?? null;
    const tunnelName =
      roadName ?? fallbackTunnelName(isTunnel ? "TUNNEL" : "TRANCHEE_COUVERTE", null, lengthM);
    const mid = seg[Math.floor(seg.length / 2)];
    const tunnelKey = makeTunnelKey({
      name: tunnelName === "Tunnel sans nom" ? null : tunnelName,
      midLat: mid?.[0] ?? null,
      midLng: mid?.[1] ?? null,
      lengthM,
      roadName,
    });

    tunnels.push({
      name: tunnelName,
      type: isTunnel ? "Tunnel fermé" : "Passage couvert",
      isClosed: isTunnel,
      category: isTunnel ? "TUNNEL" : "TRANCHEE_COUVERTE",
      provenance: "GraphHopper",
      lengthM,
      traversalSec,
      position,
      fromIdx: from,
      toIdx: to,
      coords: seg,
      timeFromStartSec: ratio * totalDurationSec,
      distanceFromStartM: distFromStart,
      roadName,
      tunnelKey,
    });
  }

  const confidence: Confidence = path.distance > 300_000 ? "medium" : "high";
  return { tunnels, confidence };
}

async function fetchRoutes(from: GeocodeHit, to: GeocodeHit, key: string): Promise<GHPath[]> {
  const params = new URLSearchParams({
    profile: "car",
    points_encoded: "false",
    algorithm: "alternative_route",
    "alternative_route.max_paths": "4",
    "alternative_route.max_weight_factor": "2.2",
    "alternative_route.max_share_factor": "0.8",
    locale: "fr",
    key,
  });
  params.append("point", `${from.point.lat},${from.point.lng}`);
  params.append("point", `${to.point.lat},${to.point.lng}`);
  params.append("details", "road_environment");
  params.append("details", "street_name");
  params.append("details", "max_speed");
  params.append("details", "road_class");

  const url = `${GH_BASE}/route?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échec du calcul d'itinéraire (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { paths?: GHPath[] };
  if (!data.paths?.length) throw new Error("Aucun itinéraire trouvé");
  return data.paths;
}

/**
 * Layer 1: GraphHopper custom_model with a strong anti-tunnel priority.
 * Optionally adds via-points to force a detour around known tunnel midpoints
 * (Layer 3 workaround when avoid-polygons aren't available in our plan).
 */
async function fetchAntiTunnelRoute(
  from: GeocodeHit,
  to: GeocodeHit,
  key: string,
  opts: {
    via?: Array<{ lat: number; lng: number }>;
    avoidMotorways?: boolean;
    alternatives?: boolean;
  } = {},
): Promise<GHPath[]> {
  try {
    const priority: Array<Record<string, unknown>> = [
      { if: "road_environment == TUNNEL", multiply_by: "0.01" },
    ];
    if (opts.avoidMotorways) {
      priority.push({ if: "road_class == MOTORWAY", multiply_by: "0.2" });
    }
    const points: Array<[number, number]> = [
      [from.point.lng, from.point.lat],
      ...(opts.via ?? []).map((p) => [p.lng, p.lat] as [number, number]),
      [to.point.lng, to.point.lat],
    ];
    const body: Record<string, unknown> = {
      profile: "car",
      points,
      points_encoded: false,
      locale: "fr",
      "ch.disable": true,
      custom_model: {
        priority,
        distance_influence: 200,
      },
      details: ["road_environment", "street_name", "max_speed", "road_class"],
    };
    if (opts.alternatives && !opts.via?.length) {
      body.algorithm = "alternative_route";
      body["alternative_route.max_paths"] = "4";
      body["alternative_route.max_weight_factor"] = opts.avoidMotorways ? "3.5" : "2.8";
      body["alternative_route.max_share_factor"] = "0.65";
    }
    const res = await fetch(`${GH_BASE}/route?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { paths?: GHPath[] };
    return data.paths ?? [];
  } catch {
    return [];
  }
}

function summarize(path: GHPath, label: string): AnalyzedRoute {
  const durationSec = path.time / 1000;
  const { tunnels, confidence } = extractTunnels(path, durationSec);
  const coords: Array<[number, number]> = path.points.coordinates.map(([lng, lat]) => [lat, lng]);
  const totalTunnelM = tunnels.reduce((s, t) => s + t.lengthM, 0);
  const longestTunnelM = tunnels.length ? Math.max(...tunnels.map((t) => t.lengthM)) : 0;
  const longestTunnelSec = tunnels.length ? Math.max(...tunnels.map((t) => t.traversalSec)) : 0;
  const totalTunnelSec = tunnels.reduce((s, t) => s + t.traversalSec, 0);
  const closedTunnelCount = tunnels.filter((t) => t.isClosed).length;
  const coveredCount = tunnels.filter((t) => !t.isClosed).length;
  const { risk: geoRisk } = assessGeoRisk(coords);
  const { certainty, reasons } = computeCertainty({
    tunnels,
    coveredCount,
    suspectedAreaCount: 0,
    geoRisk,
    confidence,
  });
  return {
    label,
    distanceM: path.distance,
    durationSec,
    coords,
    tunnels,
    comfort: scoreRoute(tunnels),
    confidence,
    totalTunnelM,
    longestTunnelM,
    longestTunnelSec,
    totalTunnelSec,
    closedTunnelCount,
    coveredCount,
    suspectedAreaCount: 0,
    geoRisk,
    certainty,
    certaintyReasons: reasons,
    trulyTunnelFree: tunnels.length === 0 && certainty === "high",
    verificationStatus: tunnels.length === 0 ? "PARTIAL" : "VERIFIED",
    verificationFailureReason: null,
    debug: {
      verification: {
        source: "overpass_osm",
        overpassStatus: "not_run",
        retryCount: 0,
        failureReason: null,
        riskZoneDowngradeApplied: false,
        tunnelFreeDowngraded: false,
      },
      certainty: {
        confidence,
        geoRisk,
        coveredCount,
        suspectedAreaCount: 0,
        tunnelCount: tunnels.length,
        resultingCertainty: certainty,
      },
    },
  };
}

function nearlyDuplicate(a: AnalyzedRoute, b: AnalyzedRoute) {
  return Math.abs(a.distanceM - b.distanceM) < 50 && Math.abs(a.durationSec - b.durationSec) < 20;
}

/** Generate via-point candidates offset from a tunnel midpoint. */
// =====================================================================
// OpenRouteService + Overpass: iterative tunnel-free routing.
// Tunnels are treated as forbidden geographic zones (avoid_polygons).
// Overpass (OSM) is the ground-truth tunnel detector — we don't trust
// any routing engine blindly.
// =====================================================================

const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface ORSResult {
  coords: Array<[number, number]>; // [lat, lng]
  distanceM: number;
  durationSec: number;
}

async function fetchORSRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  avoidPolygons: Array<Array<[number, number]>>, // each ring: [[lng,lat],...]
  orsKey: string,
): Promise<ORSResult | null> {
  const body: Record<string, unknown> = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    instructions: false,
    geometry: true,
  };
  if (avoidPolygons.length) {
    body.options = {
      avoid_polygons: {
        type: "MultiPolygon",
        coordinates: avoidPolygons.map((ring) => [ring]),
      },
    };
  }
  try {
    const res = await fetch(ORS_URL, {
      method: "POST",
      headers: {
        Authorization: orsKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: Array<[number, number]> };
        properties?: { summary?: { distance?: number; duration?: number } };
      }>;
    };
    const feat = data.features?.[0];
    if (!feat) return null;
    const coords: Array<[number, number]> = feat.geometry.coordinates.map(([lng, lat]) => [
      lat,
      lng,
    ]);
    const summary = feat.properties?.summary ?? {};
    return {
      coords,
      distanceM: summary.distance ?? 0,
      durationSec: summary.duration ?? 0,
    };
  } catch {
    return null;
  }
}

type OverpassVerificationState =
  | "verification_success_no_tunnel"
  | "verification_success_tunnel_found"
  | "verification_partial"
  | "verification_failed";

interface OverpassVerificationResult extends LocalOverpassAuditResult {
  state: OverpassVerificationState;
  source: "overpass_osm";
}

async function queryOverpassZone(
  zone: OverpassZone,
  context: ZoneQueryContext,
): Promise<ZoneQueryResult> {
  const ql = `[out:json][timeout:25];
(
  way["highway"]["tunnel"~"."](${zone.south},${zone.west},${zone.north},${zone.east});
  way["highway"]["covered"~"."](${zone.south},${zone.west},${zone.north},${zone.east});
);
out geom tags;`;
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remainingMs = context.deadlineMs - Date.now();
    if (remainingMs < 250 || context.signal.aborted) {
      return { ok: false, tunnels: [], retryCount: attempt, failureReason: "timeout" };
    }
    const controller = new AbortController();
    const abortFromBudget = () => controller.abort();
    context.signal.addEventListener("abort", abortFromBudget, { once: true });
    // A slow cell no longer monopolises a worker for 60 seconds (two 30s attempts).
    const timeout = setTimeout(() => controller.abort(), Math.min(12_000, remainingMs));
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(ql)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      context.signal.removeEventListener("abort", abortFromBudget);
      if (!res.ok) {
        const failureReason =
          res.status === 429
            ? "rate_limit"
            : res.status === 408 || res.status === 504
              ? "timeout"
              : "http_error";
        if (
          attempt + 1 < maxAttempts &&
          (failureReason === "rate_limit" || failureReason === "timeout")
        ) {
          if (context.deadlineMs - Date.now() < 1_000) break;
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        return {
          ok: false,
          tunnels: [],
          retryCount: attempt,
          failureReason,
          httpStatus: res.status,
        };
      }
      const data = (await res.json()) as {
        elements?: Array<{
          id?: number;
          type: string;
          geometry?: Array<{ lat: number; lon: number }>;
          tags?: Record<string, string>;
        }>;
      };
      if (!data || !Array.isArray(data.elements)) {
        return { ok: false, tunnels: [], retryCount: attempt, failureReason: "invalid_response" };
      }
      const tunnels: OsmTunnelObservation[] = [];
      const seen = new Set<number>();
      for (const element of data.elements) {
        if (
          element.type !== "way" ||
          typeof element.id !== "number" ||
          seen.has(element.id) ||
          !element.geometry?.length
        )
          continue;
        seen.add(element.id);
        const coords: Array<[number, number]> = element.geometry.map(({ lat, lon }) => [lat, lon]);
        const lengthM = coords
          .slice(1)
          .reduce((sum, point, index) => sum + haversine(coords[index], point), 0);
        tunnels.push({
          osmId: element.id,
          coords,
          tags: { ...(element.tags ?? {}) },
          lengthM,
        });
      }
      return { ok: true, tunnels, retryCount: attempt };
    } catch (error) {
      clearTimeout(timeout);
      context.signal.removeEventListener("abort", abortFromBudget);
      const failureReason =
        error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : error instanceof TypeError
            ? "network_error"
            : "invalid_response";
      if (attempt + 1 < maxAttempts) {
        if (context.deadlineMs - Date.now() < 1_000 || context.signal.aborted) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      return { ok: false, tunnels: [], retryCount: attempt, failureReason };
    }
  }
  return { ok: false, tunnels: [], retryCount: maxAttempts - 1, failureReason: "network_error" };
}

async function detectTunnelsOverpass(
  routeGeometries: Array<Array<[number, number]>>,
  globalDeadlineMs = Date.now() + 28_000,
): Promise<OverpassVerificationResult> {
  const audit = await auditOverpassZones(buildOverpassZones(routeGeometries), queryOverpassZone, {
    concurrency: 3,
    budgetMs: Math.max(1, globalDeadlineMs - Date.now()),
  });
  return {
    ...audit,
    state:
      audit.status === "FAILED"
        ? "verification_failed"
        : audit.status === "PARTIAL"
          ? "verification_partial"
          : audit.tunnels.length === 0
            ? "verification_success_no_tunnel"
            : "verification_success_tunnel_found",
    source: "overpass_osm",
  };
}

function buildAvoidPolygon(
  midLat: number,
  midLng: number,
  radiusM: number,
): Array<[number, number]> {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((midLat * Math.PI) / 180));
  const ring: Array<[number, number]> = [];
  const sides = 8;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([midLng + Math.cos(a) * dLng, midLat + Math.sin(a) * dLat]);
  }
  ring.push(ring[0]);
  return ring;
}

interface ORSIterativeResult {
  route: ORSResult | null;
  tunnelsRemaining: number;
  attempts: number;
  polygonsCreated: number;
  perPassTunnelCounts: number[];
  failureReason: string | null;
}

async function iterativeTunnelFreeORS(
  from: GeocodeHit,
  to: GeocodeHit,
  orsKey: string,
  maxAttempts = 5,
  overpassDeadlineMs = Date.now() + 28_000,
): Promise<ORSIterativeResult> {
  const polygons: Array<Array<[number, number]>> = [];
  const perPass: number[] = [];
  let last: ORSResult | null = null;
  let attempts = 0;
  let failureReason: string | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    if (Date.now() >= overpassDeadlineMs) {
      failureReason = "Budget global de vérification Overpass atteint.";
      break;
    }
    attempts++;
    const route = await fetchORSRoute(
      { lat: from.point.lat, lng: from.point.lng },
      { lat: to.point.lat, lng: to.point.lng },
      polygons,
      orsKey,
    );
    if (!route) {
      failureReason =
        "OpenRouteService n'a pas pu calculer d'itinéraire avec les zones interdites.";
      break;
    }
    last = route;
    const verification = await detectTunnelsOverpass([route.coords], overpassDeadlineMs);
    if (verification.status !== "VERIFIED") {
      failureReason =
        "Vérification Overpass impossible pendant la recherche de trajet sans tunnel.";
      break;
    }
    const tunnels = verification.tunnels.filter(
      (tunnel) => associateGeometry(tunnel.coords, route.coords).state !== "OFF_ROUTE",
    );
    perPass.push(tunnels.length);
    if (tunnels.length === 0) {
      return {
        route,
        tunnelsRemaining: 0,
        attempts,
        polygonsCreated: polygons.length,
        perPassTunnelCounts: perPass,
        failureReason: null,
      };
    }
    for (const t of tunnels) {
      const radius = t.lengthM > 500 ? 800 : 300;
      const mid = t.coords[Math.floor(t.coords.length / 2)];
      if (mid) polygons.push(buildAvoidPolygon(mid[0], mid[1], radius));
    }
  }
  if (!failureReason) {
    failureReason = "Nombre maximum de tentatives de reroutage atteint sans trajet sans tunnel.";
  }
  return {
    route: last,
    tunnelsRemaining: perPass[perPass.length - 1] ?? -1,
    attempts,
    polygonsCreated: polygons.length,
    perPassTunnelCounts: perPass,
    failureReason,
  };
}

/** Generate via-point candidates offset from a tunnel midpoint. */
function offsetVias(
  midLat: number,
  midLng: number,
  radiusM: number,
): Array<{ lat: number; lng: number }> {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((midLat * Math.PI) / 180));
  return [
    { lat: midLat + dLat, lng: midLng }, // N
    { lat: midLat - dLat, lng: midLng }, // S
    { lat: midLat, lng: midLng + dLng }, // E
    { lat: midLat, lng: midLng - dLng }, // W
  ];
}

const prefsSchema = z
  .object({
    maxTunnelLengthM: z.union([
      z.literal(0),
      z.literal(100),
      z.literal(300),
      z.literal(800),
      z.literal(1500),
      z.null(),
    ]),
    maxTotalTunnelSec: z.union([z.literal(60), z.literal(180), z.literal(600), z.null()]),
    avoidClosed: z.boolean(),
    preferTunnelFree: z.boolean(),
  })
  .optional();

function applyCartographicAudit(
  route: AnalyzedRoute,
  verification: Pick<OverpassVerificationResult, "state" | "status" | "tunnels" | "retryCount"> & {
    failureReason: string | null;
  },
  source: "OSM local" | "OSM/Overpass" = "OSM/Overpass",
  local?: LocalTunnelQuery,
): void {
  route.debug.verification.source = source === "OSM local" ? "local_osm" : "overpass_osm";
  if (local) {
    route.debug.verification.localOsmStatus = local.fullyCovered ? "verified" : "partial";
    route.debug.verification.localSnapshotId = local.snapshotId;
    route.debug.verification.localCandidatesExamined = local.examinedCount;
    route.debug.verification.localQueryMs = local.elapsedMs;
  }
  route.debug.verification.overpassStatus = verification.state;
  route.debug.verification.retryCount = verification.retryCount;
  route.debug.verification.failureReason = verification.failureReason;

  if (verification.state === "verification_failed") {
    route.certainty = "low";
    route.trulyTunnelFree = false;
    route.verificationStatus = "FAILED";
    route.verificationFailureReason = verification.failureReason;
    route.certaintyReasons = [
      "Vérification incomplète : certaines sources n'ont pas pu être contrôlées.",
      ...(verification.failureReason ? [`Cause: ${verification.failureReason}`] : []),
    ];
    route.debug.verification.tunnelFreeDowngraded = true;
    route.debug.certainty.resultingCertainty = "low";
    return;
  }

  const merged = mergeTunnelObservations(
    route.tunnels,
    verification.tunnels,
    route.coords,
    route.durationSec,
    source,
  );
  route.tunnels = merged.tunnels.map((tunnel) => {
    const mid = tunnel.coords[Math.floor(tunnel.coords.length / 2)];
    return {
      ...tunnel,
      tunnelKey:
        tunnel.tunnelKey ??
        makeTunnelKey({
          name: tunnel.name,
          midLat: mid?.[0],
          midLng: mid?.[1],
          lengthM: tunnel.lengthM,
          roadName: tunnel.roadName,
        }),
    };
  });
  route.suspectedAreaCount = route.tunnels.filter(
    (tunnel) => tunnel.category === "INCERTAIN" || tunnel.association === "UNCERTAIN",
  ).length;
  route.totalTunnelM = route.tunnels.reduce((sum, tunnel) => sum + tunnel.lengthM, 0);
  route.longestTunnelM = route.tunnels.length
    ? Math.max(...route.tunnels.map((tunnel) => tunnel.lengthM))
    : 0;
  route.longestTunnelSec = route.tunnels.length
    ? Math.max(...route.tunnels.map((tunnel) => tunnel.traversalSec))
    : 0;
  route.totalTunnelSec = route.tunnels.reduce((sum, tunnel) => sum + tunnel.traversalSec, 0);
  route.closedTunnelCount = route.tunnels.filter((tunnel) => tunnel.category === "TUNNEL").length;
  route.coveredCount = route.tunnels.filter(
    (tunnel) => tunnel.category === "TRANCHEE_COUVERTE",
  ).length;
  route.comfort = scoreRoute(route.tunnels);

  const certainty = computeCertainty({
    tunnels: route.tunnels,
    coveredCount: route.coveredCount,
    suspectedAreaCount: route.suspectedAreaCount,
    geoRisk: route.geoRisk,
    confidence: route.confidence,
  });
  route.certainty = certainty.certainty;
  route.certaintyReasons = certainty.reasons;
  const coverageIncomplete = verification.status === "PARTIAL";
  route.verificationFailureReason = coverageIncomplete ? verification.failureReason : null;
  route.verificationStatus =
    coverageIncomplete || route.suspectedAreaCount > 0 ? "PARTIAL" : "VERIFIED";
  if (coverageIncomplete) {
    route.certainty = "low";
    route.certaintyReasons = [
      "Vérification cartographique incomplète : certaines zones locales n'ont pas répondu.",
      ...route.certaintyReasons,
    ];
  }
  route.trulyTunnelFree =
    canClaimVerifiedTunnelFree({
      graphHopperAnalyzed: true,
      cartographyVerified: verification.status === "VERIFIED",
      tunnels: route.tunnels,
    }) &&
    route.suspectedAreaCount === 0 &&
    route.certainty === "high" &&
    route.verificationStatus === "VERIFIED";
  route.debug.verification.riskZoneDowngradeApplied = route.geoRisk === "high";
  route.debug.verification.tunnelFreeDowngraded =
    route.tunnels.length === 0 && !route.trulyTunnelFree;
  route.debug.certainty.coveredCount = route.coveredCount;
  route.debug.certainty.suspectedAreaCount = route.suspectedAreaCount;
  route.debug.certainty.tunnelCount = route.tunnels.length;
  route.debug.certainty.resultingCertainty = route.certainty;
}

export const analyzeRoute = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.string().min(2).max(200),
        to: z.string().min(2).max(200),
        prefs: prefsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.GRAPHHOPPER_API_KEY;
    if (!key) {
      return {
        error: "Le service d'itinéraire n'est pas configuré. Veuillez ajouter GRAPHHOPPER_API_KEY.",
      } as const;
    }

    const prefs: Preferences = data.prefs ?? {
      maxTunnelLengthM: null,
      maxTotalTunnelSec: null,
      avoidClosed: false,
      preferTunnelFree: true,
    };
    const strictNoTunnels = prefs.maxTunnelLengthM === 0;

    // Debug counters
    let routingAttempts = 0;
    let customModelUsed = false;
    let tunnelFreeCandidates = 0;
    let detourAttempts = 0;
    let noTunnelFreeReason: string | null = null;

    try {
      const [from, to] = await Promise.all([geocodeOne(data.from, key), geocodeOne(data.to, key)]);

      // LAYER 1: standard alternatives + anti-tunnel custom model (both variants).
      routingAttempts += 3;
      customModelUsed = true;
      const [paths, tunnelFreeHwy, tunnelFreeBack] = await Promise.all([
        fetchRoutes(from, to, key),
        fetchAntiTunnelRoute(from, to, key, { alternatives: true }),
        fetchAntiTunnelRoute(from, to, key, { alternatives: true, avoidMotorways: true }),
      ]);

      const routes = paths.map((p, i) => summarize(p, `Itinéraire ${i + 1}`));
      // One shared budget covers every possible Overpass pass (including the
      // optional ORS loop), so those passes cannot accumulate for minutes.
      const overpassDeadlineMs = Date.now() + 28_000;

      const considerCandidate = (r: AnalyzedRoute) => {
        const dup = routes.findIndex((x) => nearlyDuplicate(x, r));
        if (dup === -1) {
          routes.push(r);
        } else if (r.totalTunnelM < routes[dup].totalTunnelM) {
          routes[dup] = r;
        }
      };

      const tfCandidates: AnalyzedRoute[] = [];
      tunnelFreeHwy.forEach((p) => tfCandidates.push(summarize(p, "Itinéraire sans tunnel")));
      tunnelFreeBack.forEach((p) => tfCandidates.push(summarize(p, "Itinéraire sans tunnel")));
      tfCandidates.sort((a, b) => a.totalTunnelM - b.totalTunnelM || a.durationSec - b.durationSec);
      for (const tf of tfCandidates) {
        considerCandidate(tf);
        if (tf.tunnels.length === 0) tunnelFreeCandidates += 1;
      }

      // LAYER 2 (primary tunnel-free engine): OpenRouteService + Overpass
      // iterative rerouting. Tunnels are treated as forbidden geographic
      // zones. We trust Overpass (OSM) as the ground-truth detector and
      // never label a route "sans tunnel" without re-validation.
      let orsDebug: ORSIterativeResult | null = null;
      const haveTunnelFree = () => routes.some((r) => r.tunnels.length === 0);
      if (strictNoTunnels && !haveTunnelFree()) {
        const orsKey = process.env.OPENROUTESERVICE_API_KEY;
        if (orsKey) {
          orsDebug = await iterativeTunnelFreeORS(from, to, orsKey, 5, overpassDeadlineMs);
          routingAttempts += orsDebug.attempts;
          if (orsDebug.route && orsDebug.tunnelsRemaining === 0) {
            const orsGeo = assessGeoRisk(orsDebug.route.coords);
            const orsCert = computeCertainty({
              tunnels: [],
              coveredCount: 0,
              suspectedAreaCount: 0,
              geoRisk: orsGeo.risk,
              confidence: "high",
            });
            const orsRoute: AnalyzedRoute = {
              label: "Trajet sans tunnel",
              distanceM: orsDebug.route.distanceM,
              durationSec: orsDebug.route.durationSec,
              coords: orsDebug.route.coords,
              tunnels: [],
              comfort: "very",
              confidence: "high",
              totalTunnelM: 0,
              longestTunnelM: 0,
              longestTunnelSec: 0,
              totalTunnelSec: 0,
              closedTunnelCount: 0,
              coveredCount: 0,
              suspectedAreaCount: 0,
              geoRisk: orsGeo.risk,
              certainty: orsCert.certainty,
              certaintyReasons: orsCert.reasons,
              trulyTunnelFree: orsCert.certainty === "high",
              verificationStatus: "PARTIAL",
              verificationFailureReason: null,
              debug: {
                verification: {
                  source: "overpass_osm",
                  overpassStatus: "verification_success_no_tunnel",
                  retryCount: 0,
                  failureReason: null,
                  riskZoneDowngradeApplied: orsGeo.risk === "high",
                  tunnelFreeDowngraded: orsGeo.risk === "high" || orsCert.certainty !== "high",
                },
                certainty: {
                  confidence: "high",
                  geoRisk: orsGeo.risk,
                  coveredCount: 0,
                  suspectedAreaCount: 0,
                  tunnelCount: 0,
                  resultingCertainty: orsCert.certainty,
                },
              },
            };
            tunnelFreeCandidates += 1;
            considerCandidate(orsRoute);
          }
        } else {
          noTunnelFreeReason =
            "Le moteur de routage sans tunnel n'est pas configuré (clé OpenRouteService manquante).";
        }
      }

      // LAYER 3 (legacy fallback): GraphHopper detour search via offset waypoints.

      if (strictNoTunnels && !haveTunnelFree()) {
        // Pick reference route with the fewest tunnels to seed detours.
        const ref = [...routes].sort((a, b) => a.tunnels.length - b.tunnels.length)[0];
        const seedTunnels = ref?.tunnels ?? [];
        const MAX_ATTEMPTS = 16;
        outer: for (const radius of [500, 1000, 2000]) {
          for (const t of seedTunnels) {
            const mid = t.coords[Math.floor(t.coords.length / 2)];
            if (!mid) continue;
            const vias = offsetVias(mid[0], mid[1], radius);
            // Run the 4 directions in parallel per tunnel/radius.
            const batch = await Promise.all(
              vias.map((via) => {
                detourAttempts += 1;
                routingAttempts += 1;
                return fetchAntiTunnelRoute(from, to, key, { via: [via] });
              }),
            );
            for (const paths of batch) {
              for (const p of paths) {
                const cand = summarize(p, "Itinéraire sans tunnel (détour)");
                if (cand.tunnels.length === 0) {
                  tunnelFreeCandidates += 1;
                  considerCandidate(cand);
                  break outer;
                }
              }
            }
            if (detourAttempts >= MAX_ATTEMPTS) break outer;
          }
        }
        if (!haveTunnelFree()) {
          noTunnelFreeReason =
            "Aucune des alternatives ni des détours testés (jusqu'à " +
            detourAttempts +
            " détours) n'a produit un itinéraire sans tunnel détecté.";
        }
      }

      // AUDIT PASS: the versioned local OSM snapshot is primary and synchronous.
      // Live Overpass is opt-in and only used when no local snapshot is usable.
      const activeLocalRepository =
        process.env.LOCAL_OSM_ENABLED === "false"
          ? unavailableLocalTunnelRepository
          : localTunnelRepository;
      const localQueries = routes.map((route) =>
        activeLocalRepository.queryTunnelCandidates(route.coords),
      );
      const needsFallback = localQueries.some((query) => !query.available);
      const liveFallbackEnabled = process.env.ENABLE_OVERPASS_FALLBACK === "true";
      const liveVerification =
        needsFallback && liveFallbackEnabled
          ? await detectTunnelsOverpass(
              routes.filter((_, i) => !localQueries[i].available).map((route) => route.coords),
              overpassDeadlineMs,
            )
          : null;
      routes.forEach((route, index) => {
        const local = localQueries[index];
        if (local.available) {
          applyCartographicAudit(
            route,
            {
              status: local.fullyCovered ? "VERIFIED" : "PARTIAL",
              state: local.fullyCovered
                ? local.observations.length
                  ? "verification_success_tunnel_found"
                  : "verification_success_no_tunnel"
                : "verification_partial",
              tunnels: local.observations,
              retryCount: 0,
              failureReason: local.fullyCovered ? null : "snapshot_outside_coverage",
            },
            "OSM local",
            local,
          );
        } else if (liveVerification) {
          applyCartographicAudit(route, liveVerification);
        } else {
          applyCartographicAudit(route, {
            status: "FAILED",
            state: "verification_failed",
            tunnels: [],
            retryCount: 0,
            failureReason: "local_snapshot_unavailable",
          });
          route.debug.verification.localOsmStatus = "unavailable";
        }
      });
      // Wikidata and the local CETU reference only enrich structures already
      // detected on a route; failure/timeout never blocks the route response.
      const wikidata = await fetchWikidataEnrichment(routes.flatMap((route) => route.tunnels));
      routes.forEach((route) => {
        route.tunnels = enrichTunnels(route.tunnels, wikidata);
        route.totalTunnelM = route.tunnels.reduce((sum, tunnel) => sum + tunnel.lengthM, 0);
        route.longestTunnelM = route.tunnels.length
          ? Math.max(...route.tunnels.map((tunnel) => tunnel.lengthM))
          : 0;
      });

      // LAYER 2: strict compliance mask. Preferences are HARD constraints.
      const compliantMask = routes.map((r) => routePassesStrict(r, prefs));
      const anyCompliant = compliantMask.some(Boolean);

      const argmin = (
        score: (r: AnalyzedRoute, i: number) => number,
        eligible?: (i: number) => boolean,
      ) => {
        let best = -1;
        let bestScore = Infinity;
        routes.forEach((r, i) => {
          if (eligible && !eligible(i)) return;
          const s = score(r, i);
          if (s < bestScore) {
            bestScore = s;
            best = i;
          }
        });
        return best;
      };

      const fastestIdx = argmin((r) => r.durationSec);

      const exposureScore = (r: AnalyzedRoute) =>
        r.totalTunnelM * 1000 +
        r.durationSec +
        (prefs.avoidClosed ? r.closedTunnelCount * 5_000_000 : 0);
      let comfyIdx = anyCompliant
        ? argmin(exposureScore, (i) => compliantMask[i])
        : argmin(exposureScore);

      // "Tunnel-free" must mean truly tunnel-free (high certainty).
      const trulyTunnelFreeIdx = routes.findIndex((r) => r.trulyTunnelFree);
      const probablyTunnelFreeIdx = routes.findIndex(
        (r) => r.tunnels.length === 0 && !r.trulyTunnelFree,
      );
      const tunnelFreeIdx = trulyTunnelFreeIdx;
      const tunnelFreeStrict = trulyTunnelFreeIdx !== -1;

      if (
        prefs.preferTunnelFree &&
        trulyTunnelFreeIdx !== -1 &&
        compliantMask[trulyTunnelFreeIdx]
      ) {
        comfyIdx = trulyTunnelFreeIdx;
      }

      const softLabel = (r: AnalyzedRoute) =>
        r.certainty === "medium"
          ? "Trajet probablement sans tunnel"
          : "Aucun tunnel clairement identifié";

      routes[fastestIdx].label = "Itinéraire le plus rapide";
      if (anyCompliant) {
        if (strictNoTunnels) {
          routes[comfyIdx].label = routes[comfyIdx].trulyTunnelFree
            ? "Trajet sans tunnel"
            : softLabel(routes[comfyIdx]);
        } else {
          routes[comfyIdx].label = "Le plus confortable";
        }
      } else {
        routes[comfyIdx].label = "Alternative la plus proche disponible";
      }
      if (
        trulyTunnelFreeIdx !== -1 &&
        trulyTunnelFreeIdx !== fastestIdx &&
        trulyTunnelFreeIdx !== comfyIdx
      ) {
        routes[trulyTunnelFreeIdx].label = "Trajet sans tunnel";
      } else if (
        probablyTunnelFreeIdx !== -1 &&
        probablyTunnelFreeIdx !== fastestIdx &&
        probablyTunnelFreeIdx !== comfyIdx
      ) {
        routes[probablyTunnelFreeIdx].label = softLabel(routes[probablyTunnelFreeIdx]);
      }

      if (strictNoTunnels && !tunnelFreeStrict && !noTunnelFreeReason) {
        noTunnelFreeReason =
          probablyTunnelFreeIdx !== -1
            ? "Un itinéraire sans tunnel détecté a été trouvé, mais la certitude n'est pas suffisante (zones couvertes possibles ou région à risque cartographique)."
            : "Les itinéraires standards et anti-tunnels renvoyés par le moteur contiennent tous au moins un tunnel détecté.";
      }

      return {
        from: { lat: from.point.lat, lng: from.point.lng, label: data.from },
        to: { lat: to.point.lat, lng: to.point.lng, label: data.to },
        routes,
        recommendedIndex: anyCompliant ? comfyIdx : null,
        fallbackIndex: anyCompliant ? null : comfyIdx,
        fastestIndex: fastestIdx,
        tunnelFreeIndex: tunnelFreeIdx === -1 ? null : tunnelFreeIdx,
        tunnelFreeAvailable: tunnelFreeIdx !== -1,
        tunnelFreeStrict,
        compliantMask,
        anyCompliant,
        debug: {
          routingAttempts,
          detourAttempts,
          customModelUsed,
          tunnelFreeCandidates,
          noTunnelFreeReason,
          strictNoTunnelsRequested: strictNoTunnels,
          ors: orsDebug
            ? {
                attempts: orsDebug.attempts,
                polygonsCreated: orsDebug.polygonsCreated,
                perPassTunnelCounts: orsDebug.perPassTunnelCounts,
                tunnelsRemaining: orsDebug.tunnelsRemaining,
                failureReason: orsDebug.failureReason,
              }
            : null,
        },
      } as const;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { error: msg } as const;
    }
  });
