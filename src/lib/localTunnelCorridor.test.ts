import { describe, expect, test } from "bun:test";
import { LocalTunnelRepository, type LocalTunnelSnapshot } from "./localTunnelRepository";

function record(osmId: number, lat: number, lng: number) {
  return {
    osmId,
    geometry: [
      [lat, lng] as [number, number],
      [lat + 0.001, lng + 0.001] as [number, number],
    ],
    bbox: [lat, lng, lat + 0.001, lng + 0.001] as [number, number, number, number],
    lengthM: 120,
    tags: { highway: "motorway", tunnel: "yes" },
  };
}

describe("corridor OSM local", () => {
  test("une route longue n'aspire plus tous les tunnels du grand rectangle départ-arrivée", () => {
    const snapshot: LocalTunnelSnapshot = {
      schemaVersion: 1,
      snapshotId: "corridor-test",
      generatedAt: "2026-08-30T00:00:00.000Z",
      source: { kind: "test", url: null, license: "test" },
      coverage: { south: 40, west: 0, north: 50, east: 10 },
      coverageMode: "exact",
      cellSizeDeg: 0.05,
      records: [
        record(1, 45.0, 4.0),
        // Inside the overall route bbox but far from the actual diagonal road.
        record(2, 44.0, 6.8),
      ],
    };
    const route: Array<[number, number]> = [
      [45.0, 4.0],
      [44.9, 4.1],
      [44.8, 4.2],
      [44.7, 4.3],
    ];

    const query = new LocalTunnelRepository(snapshot).queryTunnelCandidates(route);
    expect(query.available).toBe(true);
    expect(query.observations.map((x) => x.osmId)).toEqual([1]);
  });

  test("un même ouvrage rencontré par plusieurs segments de route n'est renvoyé qu'une fois", () => {
    const snapshot: LocalTunnelSnapshot = {
      schemaVersion: 1,
      snapshotId: "dedupe-test",
      generatedAt: "2026-08-30T00:00:00.000Z",
      source: { kind: "test", url: null, license: "test" },
      coverage: { south: 44, west: 3, north: 46, east: 5 },
      coverageMode: "exact",
      cellSizeDeg: 0.05,
      records: [record(42, 45.0, 4.0)],
    };
    const route: Array<[number, number]> = [
      [44.9995, 3.9995],
      [45.0002, 4.0002],
      [45.0008, 4.0008],
      [45.0015, 4.0015],
    ];

    const query = new LocalTunnelRepository(snapshot).queryTunnelCandidates(route);
    expect(query.observations).toHaveLength(1);
    expect(query.observations[0].osmId).toBe(42);
  });
});
