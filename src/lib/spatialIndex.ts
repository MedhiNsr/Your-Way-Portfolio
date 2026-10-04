export type LatLng = [number, number];
export type BBox = [number, number, number, number]; // south, west, north, east

export function geometryBBox(points: LatLng[], paddingM = 0): BBox | null {
  if (!points.length) return null;
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const latPad = paddingM / 111_320;
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngPad = paddingM / (111_320 * Math.max(0.2, Math.cos((meanLat * Math.PI) / 180)));
  return [
    Math.min(...lats) - latPad,
    Math.min(...lngs) - lngPad,
    Math.max(...lats) + latPad,
    Math.max(...lngs) + lngPad,
  ];
}

function intersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Deterministic uniform-grid bbox index; no runtime dependency or linear catalogue scan. */
export class SpatialGridIndex<T extends { bbox: BBox }> {
  private readonly cells = new Map<string, number[]>();
  constructor(
    private readonly records: T[],
    readonly cellSizeDeg = 0.05,
  ) {
    records.forEach((record, index) => {
      for (const key of this.keys(record.bbox)) {
        const bucket = this.cells.get(key) ?? [];
        bucket.push(index);
        this.cells.set(key, bucket);
      }
    });
  }
  private keys(box: BBox): string[] {
    const out: string[] = [];
    const s = Math.floor(box[0] / this.cellSizeDeg),
      n = Math.floor(box[2] / this.cellSizeDeg);
    const w = Math.floor(box[1] / this.cellSizeDeg),
      e = Math.floor(box[3] / this.cellSizeDeg);
    for (let y = s; y <= n; y++) for (let x = w; x <= e; x++) out.push(`${y}:${x}`);
    return out;
  }
  query(box: BBox): { records: T[]; examinedCount: number; totalCount: number } {
    const ids = new Set(this.keys(box).flatMap((key) => this.cells.get(key) ?? []));
    const examined = [...ids].map((id) => this.records[id]);
    return {
      records: examined.filter((record) => intersects(record.bbox, box)),
      examinedCount: examined.length,
      totalCount: this.records.length,
    };
  }
}
