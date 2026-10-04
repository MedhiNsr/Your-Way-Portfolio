import { describe, expect, test } from "bun:test";
import { mergeTunnelObservations, type OsmTunnelObservation } from "./routeAudit";
import {
  OVERPASS_CELL_DEGREES,
  auditOverpassZones,
  buildOverpassZones,
  type ZoneQueryResult,
} from "./overpassAudit";

const lyonNice: Array<[number, number]> = [
  [45.764, 4.8357],
  [45.2, 5.2],
  [44.5, 6.0],
  [43.7102, 7.262],
];

const observation: OsmTunnelObservation = {
  osmId: 42,
  coords: [
    [45.2, 5.2],
    [45.199, 5.201],
  ],
  tags: { highway: "motorway", tunnel: "yes", name: "Tunnel local" },
  lengthM: 150,
};

describe("zones Overpass locales", () => {
  test("A. Lyon → Nice produit plusieurs petites zones, jamais une bbox globale", () => {
    const zones = buildOverpassZones([lyonNice]);
    expect(zones.length).toBeGreaterThan(3);
    for (const zone of zones) {
      expect(zone.north - zone.south).toBeLessThan(0.4);
      expect(zone.east - zone.west).toBeLessThan(0.4);
    }
  });

  test("B. tous les échantillons des segments sont couverts", () => {
    const zones = buildOverpassZones([lyonNice]);
    for (let index = 1; index < lyonNice.length; index++) {
      const from = lyonNice[index - 1];
      const to = lyonNice[index];
      const steps = Math.ceil(
        Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) /
          (OVERPASS_CELL_DEGREES / 20),
      );
      for (let step = 0; step <= steps; step++) {
        const ratio = step / steps;
        const lat = from[0] + (to[0] - from[0]) * ratio;
        const lng = from[1] + (to[1] - from[1]) * ratio;
        expect(
          zones.some(
            (zone) =>
              zone.south <= lat && zone.north >= lat && zone.west <= lng && zone.east >= lng,
          ),
        ).toBe(true);
      }
    }
  });

  test("C. deux alternatives proches dédupliquent leurs cellules communes", () => {
    const nearby = lyonNice.map(([lat, lng]) => [lat + 0.001, lng + 0.001] as [number, number]);
    const firstCount = buildOverpassZones([lyonNice]).length;
    const zones = buildOverpassZones([lyonNice, nearby]);
    expect(zones.length).toBe(firstCount);
    expect(zones.every((zone) => zone.routeIndexes.join(",") === "0,1")).toBe(true);
  });
});

describe("agrégation des réponses Overpass locales", () => {
  const zones = buildOverpassZones([lyonNice.slice(0, 2)]).slice(0, 2);
  const success = (tunnels: OsmTunnelObservation[] = []): ZoneQueryResult => ({
    ok: true,
    tunnels,
    retryCount: 0,
  });
  const failure: ZoneQueryResult = {
    ok: false,
    tunnels: [],
    retryCount: 1,
    failureReason: "timeout",
  };

  test("D. déduplique un même osmId retourné par plusieurs zones", async () => {
    const result = await auditOverpassZones(zones, async () => success([observation]));
    expect(result.tunnels).toHaveLength(1);
    expect(result.tunnels[0].osmId).toBe(42);
  });

  test("E. toutes les zones réussies donnent VERIFIED", async () => {
    const result = await auditOverpassZones(zones, async () => success());
    expect(result.status).toBe("VERIFIED");
  });

  test("F. succès et échec donnent PARTIAL", async () => {
    let call = 0;
    const result = await auditOverpassZones(zones, async () =>
      ++call === 1 ? success() : failure,
    );
    expect(result.status).toBe("PARTIAL");
  });

  test("G. toutes les zones échouées donnent FAILED", async () => {
    const result = await auditOverpassZones(zones, async () => failure);
    expect(result.status).toBe("FAILED");
  });

  test("H. un tunnel réussi reste exploitable lors d'un audit PARTIAL", async () => {
    let call = 0;
    const result = await auditOverpassZones(zones, async () =>
      ++call === 1 ? success([observation]) : failure,
    );
    const merged = mergeTunnelObservations([], result.tunnels, lyonNice, 10_000);
    expect(result.status).toBe("PARTIAL");
    expect(merged.tunnels.map((tunnel) => tunnel.name)).toContain("Tunnel local");
  });

  test("I. budget atteint après un succès retourne vite PARTIAL et conserve le tunnel", async () => {
    const started = performance.now();
    let call = 0;
    const result = await auditOverpassZones(
      zones,
      async (_zone, context) => {
        if (++call === 1) return success([observation]);
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve()),
        );
        return failure;
      },
      { concurrency: 1, budgetMs: 25 },
    );
    expect(performance.now() - started).toBeLessThan(150);
    expect(result.status).toBe("PARTIAL");
    expect(result.tunnels).toHaveLength(1);
  });

  test("J. budget atteint sans aucune zone exploitable donne FAILED", async () => {
    const result = await auditOverpassZones(
      zones,
      async (_zone, context) => {
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve()),
        );
        return failure;
      },
      { concurrency: 1, budgetMs: 20 },
    );
    expect(result.status).toBe("FAILED");
  });
});
