import { describe, expect, test } from "bun:test";
import { LocalTunnelRepository, type LocalTunnelSnapshot } from "./localTunnelRepository";
import { mergeTunnelObservations } from "./routeAudit";
import { SpatialGridIndex, type BBox } from "./spatialIndex";
import type { Tunnel } from "./tunnels";

const through: Array<[number, number]> = [
  [45.765, 4.798],
  [45.759, 4.802],
  [45.751, 4.807],
  [45.742, 4.813],
  [45.735, 4.818],
  [45.729, 4.823],
];

const fixtureSnapshot: LocalTunnelSnapshot = {
  schemaVersion: 1,
  snapshotId: "lyon-test-fixture",
  generatedAt: "2026-08-30T00:00:00.000Z",
  source: { kind: "test-fixture", url: null, license: "Test data only" },
  coverage: { south: 45.7, west: 4.65, north: 45.82, east: 4.92 },
  coverageMode: "exact",
  cellSizeDeg: 0.02,
  records: [
    {
      osmId: 42,
      geometry: [
        [45.759, 4.802],
        [45.751, 4.807],
        [45.742, 4.813],
        [45.735, 4.818],
      ],
      bbox: [45.735, 4.802, 45.759, 4.818],
      lengthM: 1850,
      tags: {
        highway: "motorway",
        tunnel: "yes",
        official_name: "Tunnel de Fourvière",
        ref: "M6",
      },
    },
  ],
};

describe("référentiel OSM local", () => {
  test("A/B/C/D. un snapshot valide détecte sans réseau ni sources secondaires", () => {
    const repository = new LocalTunnelRepository(fixtureSnapshot);
    const query = repository.queryTunnelCandidates(through);
    expect(query.available).toBe(true);
    expect(query.fullyCovered).toBe(true);
    expect(query.elapsedMs).toBeLessThan(1000);
    const result = mergeTunnelObservations([], query.observations, through, 10_000, "OSM local");
    expect(result.tunnels).toHaveLength(1);
    expect(result.tunnels[0]).toMatchObject({
      name: "Tunnel de Fourvière",
      provenance: "OSM local",
      association: "ON_ROUTE",
    });
  });

  test("H/I. Fourvière proche mais hors route n'est pas compté", () => {
    const repository = new LocalTunnelRepository(fixtureSnapshot);
    const quay: Array<[number, number]> = [
      [45.78, 4.83],
      [45.75, 4.83],
      [45.72, 4.83],
    ];
    const result = mergeTunnelObservations(
      [],
      repository.queryTunnelCandidates(quay).observations,
      quay,
      1000,
      "OSM local",
    );
    expect(result.tunnels.some((t) => t.name === "Tunnel de Fourvière")).toBe(false);
  });

  test("F. GraphHopper et OSM local fusionnent en un ouvrage multi-source", () => {
    const gh: Tunnel = {
      name: "Tunnel",
      type: "Tunnel fermé",
      isClosed: true,
      lengthM: 1850,
      traversalSec: 90,
      position: "Près du départ",
      fromIdx: 1,
      toIdx: 4,
      coords: through.slice(1, 5),
      timeFromStartSec: 2,
      distanceFromStartM: 2,
      provenance: "GraphHopper",
    };
    const observations = new LocalTunnelRepository(fixtureSnapshot).queryTunnelCandidates(through)
      .observations;
    const result = mergeTunnelObservations([gh], observations, through, 1000, "OSM local");
    expect(result.tunnels).toHaveLength(1);
    expect(result.tunnels[0].sources).toEqual(["GraphHopper", "OSM local"]);
  });

  test("J. snapshot manquant produit un état explicite et immédiat", () => {
    expect(new LocalTunnelRepository(null).queryTunnelCandidates(through)).toMatchObject({
      available: false,
      fullyCovered: false,
      snapshotId: null,
    });
  });
});

test("E. la grille réduit fortement les comparaisons d'une route longue", () => {
  const records = Array.from({ length: 10_000 }, (_, i) => {
    const lat = 40 + (i % 100) * 0.05,
      lng = -2 + Math.floor(i / 100) * 0.05;
    return { id: i, bbox: [lat, lng, lat + 0.001, lng + 0.001] as BBox };
  });
  const index = new SpatialGridIndex(records, 0.02);
  const started = performance.now();
  const result = index.query([45, 4.8, 45.8, 4.82]);
  const elapsed = performance.now() - started;
  expect(result.examinedCount).toBeLessThan(result.totalCount / 20);
  expect(elapsed).toBeLessThan(1000);
  console.info(
    `local-index benchmark: ${elapsed.toFixed(2)} ms; ${result.examinedCount}/${result.totalCount} candidats examinés`,
  );
});
