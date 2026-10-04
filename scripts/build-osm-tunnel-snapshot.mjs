#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [input, output = "src/data/osm-tunnels.snapshot.json"] = process.argv.slice(2);
if (!input) throw new Error("Usage: build-osm-tunnel-snapshot.mjs INPUT.osm.pbf [OUTPUT.json]");
const work = mkdtempSync(join(tmpdir(), "your-way-osm-"));
const filtered = join(work, "covered.osm.pbf");
const geojson = join(work, "covered.geojsonseq");
try {
  execFileSync(
    "osmium",
    ["tags-filter", input, "w/tunnel", "w/covered", "-o", filtered, "--overwrite"],
    { stdio: "inherit" },
  );
  execFileSync(
    "osmium",
    [
      "export",
      filtered,
      "-f",
      "geojsonseq",
      "-u",
      "type_id",
      "--geometry-types=linestring",
      "-o",
      geojson,
      "--overwrite",
    ],
    { stdio: "inherit" },
  );

  const features = readFileSync(geojson, "utf8")
    .split("\n")
    .map((line) => line.replace(/^\u001e/, "").trim())
    .filter(Boolean)
    .map(JSON.parse);

  const haversine = (a, b) => {
    const r = Math.PI / 180,
      dLat = (b[1] - a[1]) * r,
      dLng = (b[0] - a[0]) * r;
    const x =
      Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 12_742_000 * Math.asin(Math.sqrt(x));
  };

  const isPositiveTag = (value) => value != null && !["no", "false", "0"].includes(String(value).toLowerCase());
  const records = features.flatMap((feature) => {
    const tags = feature.properties ?? {},
      line = feature.geometry?.type === "LineString" ? feature.geometry.coordinates : null;
    if (!line || !tags.highway || (!isPositiveTag(tags.tunnel) && !isPositiveTag(tags.covered))) return [];

    const osmId = Number(String(feature.id ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(osmId) || osmId <= 0) return [];

    const geometry = line.map(([lng, lat]) => [lat, lng]);
    const lats = geometry.map((p) => p[0]),
      lngs = geometry.map((p) => p[1]);
    const kept = [
      "name",
      "official_name",
      "alt_name",
      "tunnel:name",
      "ref",
      "highway",
      "tunnel",
      "covered",
      "layer",
      "lanes",
      "maxheight",
      "lit",
      "oneway",
      "operator",
      "access",
      "motor_vehicle",
    ];
    return [
      {
        osmId,
        geometry,
        bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
        lengthM: Math.round(line.slice(1).reduce((n, p, i) => n + haversine(line[i], p), 0)),
        tags: Object.fromEntries(
          kept.filter((k) => tags[k] != null).map((k) => [k, String(tags[k])]),
        ),
      },
    ];
  });

  if (!records.length) throw new Error("No highway tunnel/covered ways found");
  const coverage = {
    south: Number(process.env.OSM_COVERAGE_SOUTH ?? Math.min(...records.map((r) => r.bbox[0]))),
    west: Number(process.env.OSM_COVERAGE_WEST ?? Math.min(...records.map((r) => r.bbox[1]))),
    north: Number(process.env.OSM_COVERAGE_NORTH ?? Math.max(...records.map((r) => r.bbox[2]))),
    east: Number(process.env.OSM_COVERAGE_EAST ?? Math.max(...records.map((r) => r.bbox[3]))),
  };
  const generatedAt = new Date().toISOString();
  writeFileSync(
    resolve(output),
    JSON.stringify(
      {
        schemaVersion: 1,
        snapshotId: process.env.OSM_SNAPSHOT_ID ?? `osm-${generatedAt.slice(0, 10)}`,
        generatedAt,
        source: {
          kind: process.env.OSM_SOURCE_KIND ?? "OpenStreetMap PBF",
          url: process.env.OSM_SOURCE_URL ?? null,
          license: "ODbL 1.0",
        },
        coverage,
        coverageMode: process.env.OSM_COVERAGE_MODE === "exact" ? "exact" : "bbox",
        cellSizeDeg: 0.05,
        records,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${records.length} records to ${output}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
