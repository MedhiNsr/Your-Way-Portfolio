import type { OsmTunnelObservation } from "./routeAudit";

export const OVERPASS_CELL_DEGREES = 0.35;
export const OVERPASS_CELL_MARGIN_DEGREES = 0.01;

export interface OverpassZone {
  id: string;
  south: number;
  west: number;
  north: number;
  east: number;
  routeIndexes: number[];
}

export type ZoneFailureReason =
  "timeout" | "rate_limit" | "network_error" | "invalid_response" | "http_error";

export type ZoneQueryResult =
  | { ok: true; tunnels: OsmTunnelObservation[]; retryCount: number }
  | {
      ok: false;
      tunnels: [];
      retryCount: number;
      failureReason: ZoneFailureReason;
      httpStatus?: number;
    };

export interface LocalOverpassAuditResult {
  status: "VERIFIED" | "PARTIAL" | "FAILED";
  tunnels: OsmTunnelObservation[];
  successfulZoneIds: string[];
  failedZoneIds: string[];
  retryCount: number;
  failureReason: ZoneFailureReason | null;
  httpStatus?: number;
}

export interface OverpassAuditOptions {
  concurrency?: number;
  /** Hard wall-clock budget for the complete audit, including retries. */
  budgetMs?: number;
}

export interface ZoneQueryContext {
  signal: AbortSignal;
  deadlineMs: number;
}

function cellIndex(value: number): number {
  return Math.floor(value / OVERPASS_CELL_DEGREES);
}

function cellId(latIndex: number, lngIndex: number): string {
  return `${latIndex}:${lngIndex}`;
}

/**
 * Builds a deterministic union of small cells crossed by the displayed routes.
 * Sampling at one quarter of a cell prevents a long, sparsely encoded segment
 * from jumping over an intermediate cell. The query margin overlaps neighbours.
 */
export function buildOverpassZones(routes: Array<Array<[number, number]>>): OverpassZone[] {
  const cells = new Map<string, { latIndex: number; lngIndex: number; routes: Set<number> }>();
  const add = (point: [number, number], routeIndex: number) => {
    const latIndex = cellIndex(point[0]);
    const lngIndex = cellIndex(point[1]);
    const id = cellId(latIndex, lngIndex);
    const cell = cells.get(id) ?? { latIndex, lngIndex, routes: new Set<number>() };
    cell.routes.add(routeIndex);
    cells.set(id, cell);
  };

  routes.forEach((route, routeIndex) => {
    if (route.length === 1) add(route[0], routeIndex);
    for (let index = 1; index < route.length; index++) {
      const from = route[index - 1];
      const to = route[index];
      const span = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
      const steps = Math.max(1, Math.ceil(span / (OVERPASS_CELL_DEGREES / 4)));
      for (let step = 0; step <= steps; step++) {
        const ratio = step / steps;
        add([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio], routeIndex);
      }
    }
  });

  return [...cells.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, cell]) => ({
      id,
      south: cell.latIndex * OVERPASS_CELL_DEGREES - OVERPASS_CELL_MARGIN_DEGREES,
      west: cell.lngIndex * OVERPASS_CELL_DEGREES - OVERPASS_CELL_MARGIN_DEGREES,
      north: (cell.latIndex + 1) * OVERPASS_CELL_DEGREES + OVERPASS_CELL_MARGIN_DEGREES,
      east: (cell.lngIndex + 1) * OVERPASS_CELL_DEGREES + OVERPASS_CELL_MARGIN_DEGREES,
      routeIndexes: [...cell.routes].sort((a, b) => a - b),
    }));
}

export async function auditOverpassZones(
  zones: OverpassZone[],
  queryZone: (zone: OverpassZone, context: ZoneQueryContext) => Promise<ZoneQueryResult>,
  options: number | OverpassAuditOptions = {},
): Promise<LocalOverpassAuditResult> {
  if (zones.length === 0) {
    return {
      status: "FAILED",
      tunnels: [],
      successfulZoneIds: [],
      failedZoneIds: [],
      retryCount: 0,
      failureReason: "invalid_response",
    };
  }
  const { concurrency = 3, budgetMs = 28_000 } =
    typeof options === "number" ? { concurrency: options, budgetMs: 28_000 } : options;
  const results = new Array<ZoneQueryResult | undefined>(zones.length);
  let cursor = 0;
  const deadlineMs = Date.now() + Math.max(1, budgetMs);
  const controller = new AbortController();
  const worker = async () => {
    while (cursor < zones.length && !controller.signal.aborted && Date.now() < deadlineMs) {
      const index = cursor++;
      try {
        results[index] = await queryZone(zones[index], {
          signal: controller.signal,
          deadlineMs,
        });
      } catch {
        results[index] = {
          ok: false,
          tunnels: [],
          retryCount: 0,
          failureReason: controller.signal.aborted ? "timeout" : "network_error",
        };
      }
    }
  };
  const workers = Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), zones.length) }, () => worker()),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    workers,
    new Promise<void>((resolve) => {
      timer = setTimeout(
        () => {
          controller.abort();
          resolve();
        },
        Math.max(1, deadlineMs - Date.now()),
      );
    }),
  ]);
  if (timer) clearTimeout(timer);
  // Do not await workers after the deadline: completed observations are useful,
  // while in-flight fetches receive the shared abort signal.
  if (Date.now() >= deadlineMs) controller.abort();

  const successfulZoneIds: string[] = [];
  const failedZoneIds: string[] = [];
  const byOsmId = new Map<number, OsmTunnelObservation>();
  let retryCount = 0;
  let failureReason: ZoneFailureReason | null = null;
  let httpStatus: number | undefined;
  zones.forEach((zone, index) => {
    const result = results[index];
    if (!result) {
      failedZoneIds.push(zone.id);
      failureReason ??= "timeout";
      return;
    }
    retryCount += result.retryCount;
    if (result.ok) {
      successfulZoneIds.push(zone.id);
      result.tunnels.forEach((tunnel) => {
        if (!byOsmId.has(tunnel.osmId)) byOsmId.set(tunnel.osmId, tunnel);
      });
    } else {
      failedZoneIds.push(zone.id);
      failureReason ??= result.failureReason;
      httpStatus ??= result.httpStatus;
    }
  });
  const status =
    successfulZoneIds.length === 0 ? "FAILED" : failedZoneIds.length === 0 ? "VERIFIED" : "PARTIAL";
  return {
    status,
    tunnels: [...byOsmId.values()],
    successfulZoneIds,
    failedZoneIds,
    retryCount,
    failureReason,
    httpStatus,
  };
}
