import bundledSnapshot from "../data/osm-tunnels.snapshot.json";
import type { OsmTunnelObservation } from "./routeAudit";
import { geometryBBox, SpatialGridIndex, type BBox, type LatLng } from "./spatialIndex";

export interface LocalTunnelRecord {
  osmId: number;
  geometry: LatLng[];
  bbox: BBox;
  lengthM: number;
  tags: Record<string, string>;
}
export interface LocalTunnelSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  generatedAt: string;
  source: { kind: string; url: string | null; license: string };
  coverage: { south: number; west: number; north: number; east: number };
  coverageMode?: "exact" | "bbox";
  cellSizeDeg?: number;
  records: LocalTunnelRecord[];
}
export interface LocalTunnelQuery {
  available: boolean;
  fullyCovered: boolean;
  observations: OsmTunnelObservation[];
  examinedCount: number;
  totalCount: number;
  elapsedMs: number;
  snapshotId: string | null;
}

const ROUTE_CORRIDOR_PADDING_M = 90;

export class LocalTunnelRepository {
  private readonly index: SpatialGridIndex<LocalTunnelRecord> | null;
  constructor(readonly snapshot: LocalTunnelSnapshot | null) {
    this.index = snapshot ? new SpatialGridIndex(snapshot.records, snapshot.cellSizeDeg) : null;
  }

  private queryRouteCorridor(routeGeometry: LatLng[]): {
    records: LocalTunnelRecord[];
    examinedCount: number;
  } {
    if (!this.index || routeGeometry.length < 2) return { records: [], examinedCount: 0 };

    // IMPORTANT: never query the global start→finish bounding box. On a long
    // diagonal trip (Lyon→Nice for example), that rectangle covers a huge part
    // of France and returns thousands of irrelevant tunnel segments. Those
    // candidates then go through expensive geometry association and can turn a
    // local lookup into minutes of CPU work.
    //
    // Instead, query a narrow padded box around every route segment, then
    // de-duplicate by OSM id. This follows the actual road corridor and keeps
    // the expensive association stage proportional to nearby structures only.
    const byOsmId = new Map<number, LocalTunnelRecord>();
    let examinedCount = 0;

    for (let i = 1; i < routeGeometry.length; i++) {
      const segmentBox = geometryBBox(
        [routeGeometry[i - 1], routeGeometry[i]],
        ROUTE_CORRIDOR_PADDING_M,
      );
      if (!segmentBox) continue;
      const result = this.index.query(segmentBox);
      examinedCount += result.examinedCount;
      for (const record of result.records) byOsmId.set(record.osmId, record);
    }

    return { records: [...byOsmId.values()], examinedCount };
  }

  queryTunnelCandidates(routeGeometry: LatLng[]): LocalTunnelQuery {
    const started = performance.now();
    const routeBox = geometryBBox(routeGeometry, ROUTE_CORRIDOR_PADDING_M);
    if (!this.snapshot || !this.index || !routeBox)
      return {
        available: false,
        fullyCovered: false,
        observations: [],
        examinedCount: 0,
        totalCount: 0,
        elapsedMs: performance.now() - started,
        snapshotId: null,
      };
    const c = this.snapshot.coverage;
    const bboxCovered =
      routeBox[0] >= c.south &&
      routeBox[1] >= c.west &&
      routeBox[2] <= c.north &&
      routeBox[3] <= c.east;

    // A rectangular extent is useful for indexing, but it is not proof that the
    // entire route is inside the source dataset. The Geofabrik France bbox also
    // contains pieces of neighbouring countries and sea. Only an explicitly
    // exact coverage boundary may promote a route to fully covered.
    const fullyCovered = bboxCovered && this.snapshot.coverageMode === "exact";
    const result = this.queryRouteCorridor(routeGeometry);
    return {
      available: true,
      fullyCovered,
      observations: result.records.map((r) => ({
        osmId: r.osmId,
        coords: r.geometry,
        lengthM: r.lengthM,
        tags: r.tags,
      })),
      examinedCount: result.examinedCount,
      totalCount: this.snapshot.records.length,
      elapsedMs: performance.now() - started,
      snapshotId: this.snapshot.snapshotId,
    };
  }
}

export const localTunnelRepository = new LocalTunnelRepository(
  bundledSnapshot as unknown as LocalTunnelSnapshot,
);
export const unavailableLocalTunnelRepository = new LocalTunnelRepository(null);
