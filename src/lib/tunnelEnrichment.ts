import cetuData from "../data/cetu-tunnels.json";
import { associateGeometry } from "./routeAudit";
import { haversine, type Tunnel, type TunnelEvidence, type TunnelSource } from "./tunnels";

export interface CetuTunnelRecord {
  id: string;
  officialName: string;
  latitude: number;
  longitude: number;
  lengthM: number | null;
  route: string | null;
  manager: string | null;
  tubeCount: number | null;
  structureType: string | null;
  officialSource: string;
  referenceVersion: string;
}

export interface WikidataTunnelRecord {
  id: string;
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  lengthM: number | null;
  nature: string | null;
  route: string | null;
  structuraeId: string | null;
  externalIds: Record<string, string>;
}

const SOURCE_ORDER: TunnelSource[] = [
  "GraphHopper",
  "OSM local",
  "OSM/Overpass",
  "Wikidata",
  "CETU",
];
const cetuRecords = (cetuData.records ?? []) as CetuTunnelRecord[];

function midpoint(tunnel: Tunnel): [number, number] | null {
  return tunnel.coords[Math.floor(tunnel.coords.length / 2)] ?? null;
}

function sourceName(sources: TunnelSource[]): string {
  return SOURCE_ORDER.filter((source) => sources.includes(source)).join(" + ");
}

function ensureAudit(tunnel: Tunnel): void {
  const initial = (
    tunnel.sources?.length ? tunnel.sources : [tunnel.provenance ?? "GraphHopper"]
  ).filter((source): source is TunnelSource => SOURCE_ORDER.includes(source as TunnelSource));
  tunnel.sources = [...new Set(initial)];
  if (!tunnel.evidence?.length) {
    tunnel.evidence = tunnel.sources.map((source) => ({
      source,
      name: tunnel.name,
      lengthM: tunnel.lengthM,
    }));
  }
}

function addEvidence(tunnel: Tunnel, evidence: TunnelEvidence): void {
  ensureAudit(tunnel);
  if (!tunnel.sources!.includes(evidence.source)) tunnel.sources!.push(evidence.source);
  tunnel.evidence!.push(evidence);
  tunnel.provenance = sourceName(tunnel.sources!);
  tunnel.identificationConfidence = tunnel.sources!.includes("CETU")
    ? tunnel.sources!.length >= 2
      ? "very_high"
      : "high"
    : tunnel.sources!.length >= 3
      ? "high"
      : tunnel.sources!.length >= 2
        ? "high"
        : "medium";
}

function pointMatches(tunnel: Tunnel, latitude: number, longitude: number): boolean {
  const center = midpoint(tunnel);
  if (!center || haversine(center, [latitude, longitude]) > 250) return false;
  // A reference may enrich a crossing, but can never manufacture one.
  return associateGeometry(tunnel.coords, tunnel.coords).state === "ON_ROUTE";
}

export function enrichTunnels(
  tunnels: Tunnel[],
  wikidata: WikidataTunnelRecord[],
  cetu: CetuTunnelRecord[] = cetuRecords,
): Tunnel[] {
  return tunnels.map((original) => {
    const tunnel = {
      ...original,
      sources: [...(original.sources ?? [])],
      evidence: [...(original.evidence ?? [])],
    };
    ensureAudit(tunnel);
    const wiki = wikidata.find((item) => pointMatches(tunnel, item.latitude, item.longitude));
    if (wiki) {
      addEvidence(tunnel, {
        source: "Wikidata",
        externalId: wiki.id,
        name: wiki.name,
        lengthM: wiki.lengthM,
        details: {
          aliases: wiki.aliases.join("; "),
          nature: wiki.nature,
          route: wiki.route,
          structuraeId: wiki.structuraeId,
          ...wiki.externalIds,
        },
      });
      if (wiki.name) tunnel.name = wiki.name;
      if (wiki.lengthM && wiki.lengthM > 0) {
        tunnel.lengthM = wiki.lengthM;
        tunnel.lengthSource = "Wikidata";
      }
    }
    const official = cetu.find((item) => pointMatches(tunnel, item.latitude, item.longitude));
    if (official) {
      addEvidence(tunnel, {
        source: "CETU",
        externalId: official.id,
        name: official.officialName,
        lengthM: official.lengthM,
        details: {
          route: official.route,
          manager: official.manager,
          tubeCount: official.tubeCount,
          structureType: official.structureType,
          officialSource: official.officialSource,
          referenceVersion: official.referenceVersion,
        },
      });
      tunnel.name = official.officialName;
      if (official.lengthM && official.lengthM > 0) {
        tunnel.lengthM = official.lengthM;
        tunnel.lengthSource = "CETU";
      }
    }
    tunnel.provenance = sourceName(tunnel.sources!);
    return tunnel;
  });
}

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

export async function fetchWikidataEnrichment(
  tunnels: Tunnel[],
  timeoutMs = 4_000,
): Promise<WikidataTunnelRecord[]> {
  const centers = tunnels
    .map(midpoint)
    .filter((p): p is [number, number] => Boolean(p))
    .slice(0, 20);
  if (!centers.length) return [];
  const unions = centers
    .map(
      ([lat, lng]) => `{ SERVICE wikibase:around {
    ?item wdt:P625 ?location . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral;
      wikibase:radius "0.25"; wikibase:distance ?distance. } }`,
    )
    .join(" UNION ");
  const query = `SELECT DISTINCT ?item ?itemLabel ?aliases ?location ?length ?natureLabel ?routeLabel ?structurae WHERE {
    ${unions}
    ?item wdt:P31/wdt:P279* wd:Q44377.
    OPTIONAL { ?item wdt:P2043 ?length. } OPTIONAL { ?item wdt:P31 ?nature. }
    OPTIONAL { ?item wdt:P16 ?route. } OPTIONAL { ?item wdt:P454 ?structurae. }
    OPTIONAL { ?item skos:altLabel ?aliases. FILTER(LANG(?aliases) IN ("fr", "en")) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
  }`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "YourWay/1.0 (tunnel enrichment)",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return [];
    const json = (await response.json()) as {
      results?: { bindings?: Array<Record<string, { value: string }>> };
    };
    return (json.results?.bindings ?? []).flatMap((binding) => {
      const match = binding.location?.value?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      if (!match || !binding.item?.value || !binding.itemLabel?.value) return [];
      return [
        {
          id: binding.item.value.split("/").pop()!,
          name: binding.itemLabel.value,
          aliases: binding.aliases?.value?.split(", ") ?? [],
          latitude: Number(match[2]),
          longitude: Number(match[1]),
          lengthM: binding.length ? Number(binding.length.value) : null,
          nature: binding.natureLabel?.value ?? null,
          route: binding.routeLabel?.value ?? null,
          structuraeId: binding.structurae?.value ?? null,
          externalIds: {},
        },
      ];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
