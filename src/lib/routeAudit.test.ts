import { describe, expect, test } from "bun:test";
import {
  associateGeometry,
  canClaimVerifiedTunnelFree,
  classifyOsmTags,
  mergeAdjacentTunnelSegments,
  mergeTunnelObservations,
  preferredOsmName,
  type OsmTunnelObservation,
} from "./routeAudit";
import type { Tunnel } from "./tunnels";

const fourviere: Array<[number, number]> = [
  [45.759, 4.802],
  [45.751, 4.807],
  [45.742, 4.813],
  [45.735, 4.818],
];
const routeThroughFourviere: Array<[number, number]> = [
  [45.765, 4.798],
  ...fourviere,
  [45.729, 4.823],
];

function graphHopperTunnel(name: string, coords = fourviere): Tunnel {
  return {
    name,
    type: "Tunnel fermé",
    category: "TUNNEL",
    isClosed: true,
    lengthM: 1_850,
    traversalSec: 90,
    position: "Près du départ",
    fromIdx: 1,
    toIdx: 4,
    coords,
    timeFromStartSec: 300,
    distanceFromStartM: 5_000,
    roadName: "M6",
    provenance: "GraphHopper",
  };
}

function overpassFourviere(tags: Record<string, string> = {}): OsmTunnelObservation {
  return {
    osmId: 42,
    coords: fourviere,
    lengthM: 1_850,
    tags: { highway: "motorway", tunnel: "yes", ref: "M6", ...tags },
  };
}

describe("audit déterministe Écully → Nice / Fourvière", () => {
  test("A. conserve Fourvière lorsque GraphHopper le détecte", () => {
    const result = mergeTunnelObservations(
      [graphHopperTunnel("Tunnel de Fourvière")],
      [],
      routeThroughFourviere,
      12_000,
    );
    expect(result.tunnels.map((tunnel) => tunnel.name)).toContain("Tunnel de Fourvière");
    expect(result.tunnels[0].provenance).toBe("GraphHopper");
  });

  test("B. ajoute Fourvière lorsqu'Overpass le détecte sur la route", () => {
    const result = mergeTunnelObservations(
      [],
      [overpassFourviere({ official_name: "Tunnel de Fourvière" })],
      routeThroughFourviere,
      12_000,
    );
    expect(result.tunnels).toHaveLength(1);
    expect(result.tunnels[0]).toMatchObject({
      name: "Tunnel de Fourvière",
      category: "TUNNEL",
      provenance: "OSM/Overpass",
      association: "ON_ROUTE",
    });
  });

  test("C. ajoute Fourvière même si GraphHopper a détecté un autre tunnel", () => {
    const otherCoords: Array<[number, number]> = [
      [45.7, 4.84],
      [45.699, 4.841],
    ];
    const result = mergeTunnelObservations(
      [graphHopperTunnel("Autre tunnel", otherCoords)],
      [overpassFourviere({ name: "Tunnel de Fourvière" })],
      routeThroughFourviere,
      12_000,
    );
    expect(result.tunnels.map((tunnel) => tunnel.name)).toEqual(
      expect.arrayContaining(["Autre tunnel", "Tunnel de Fourvière"]),
    );
  });

  test("D. n'ajoute pas Fourvière à une route qui le contourne", () => {
    const bypass: Array<[number, number]> = [
      [45.78, 4.7],
      [45.75, 4.7],
      [45.72, 4.7],
    ];
    const result = mergeTunnelObservations([], [overpassFourviere()], bypass, 12_000);
    expect(associateGeometry(fourviere, bypass).state).toBe("OFF_ROUTE");
    expect(result.tunnels).toHaveLength(0);
  });

  test("E. un échec Overpass interdit le statut sans tunnel vérifié", () => {
    expect(
      canClaimVerifiedTunnelFree({
        graphHopperAnalyzed: true,
        overpassSucceeded: false,
        tunnels: [],
      }),
    ).toBe(false);
  });
});

describe("classification et nommage OSM", () => {
  test("F. classe covered=yes comme tranchée couverte", () => {
    expect(classifyOsmTags({ highway: "primary", covered: "yes", layer: "-1" })).toBe(
      "TRANCHEE_COUVERTE",
    );
  });

  test("F. classe tunnel=building_passage comme incertain", () => {
    expect(classifyOsmTags({ highway: "service", tunnel: "building_passage" })).toBe("INCERTAIN");
  });

  test("respecte la priorité official_name, name, alt_name, ref", () => {
    expect(
      preferredOsmName({
        official_name: "Nom officiel",
        name: "Nom usuel",
        alt_name: "Alias",
        ref: "M6",
      }),
    ).toBe("Nom officiel");
  });
});

describe("agrégation des segments OSM", () => {
  const base: Tunnel = {
    name: "Boulevard Périphérique Intérieur",
    type: "Tunnel fermé",
    category: "TUNNEL",
    isClosed: true,
    lengthM: 200,
    traversalSec: 10,
    position: "Au milieu du trajet",
    fromIdx: 10,
    toIdx: 11,
    coords: [
      [48.87, 2.28],
      [48.869, 2.282],
    ],
    timeFromStartSec: 1_000,
    distanceFromStartM: 10_000,
    roadName: "Boulevard Périphérique Intérieur",
    provenance: "OSM local",
    sources: ["OSM local"],
    association: "ON_ROUTE",
  };

  test("regroupe deux morceaux contigus du même ouvrage", () => {
    const next: Tunnel = {
      ...base,
      lengthM: 210,
      traversalSec: 11,
      fromIdx: 12,
      toIdx: 13,
      distanceFromStartM: 10_215,
      coords: [
        [48.869, 2.282],
        [48.868, 2.284],
      ],
    };
    const result = mergeAdjacentTunnelSegments([base, next]);
    expect(result).toHaveLength(1);
    expect(result[0].lengthM).toBe(410);
  });

  test("ne regroupe pas deux passages éloignés portant le même nom", () => {
    const later: Tunnel = {
      ...base,
      distanceFromStartM: 11_000,
      coords: [
        [48.86, 2.29],
        [48.859, 2.292],
      ],
    };
    expect(mergeAdjacentTunnelSegments([base, later])).toHaveLength(2);
  });
});
