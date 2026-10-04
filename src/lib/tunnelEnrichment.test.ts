import { describe, expect, test } from "bun:test";
import type { Tunnel } from "./tunnels";
import {
  enrichTunnels,
  type CetuTunnelRecord,
  type WikidataTunnelRecord,
} from "./tunnelEnrichment";
import { verificationCopy } from "./verificationCopy";

const base: Tunnel = {
  name: "Nom GraphHopper",
  type: "Tunnel fermé",
  category: "TUNNEL",
  isClosed: true,
  lengthM: 1900,
  traversalSec: 90,
  position: "Près du départ",
  fromIdx: 0,
  toIdx: 1,
  coords: [
    [45.75, 4.8],
    [45.751, 4.801],
  ],
  timeFromStartSec: 60,
  distanceFromStartM: 1000,
  provenance: "GraphHopper",
};
const wiki: WikidataTunnelRecord = {
  id: "Q1",
  name: "Nom Wikidata",
  aliases: ["Alias"],
  latitude: 45.7505,
  longitude: 4.8005,
  lengthM: 1800,
  nature: "tunnel routier",
  route: "M6",
  structuraeId: "x",
  externalIds: {},
};
const cetu: CetuTunnelRecord = {
  id: "CETU-1",
  officialName: "Nom officiel CETU",
  latitude: 45.7505,
  longitude: 4.8005,
  lengthM: 1700,
  route: "M6",
  manager: "État",
  tubeCount: 2,
  structureType: "tunnel",
  officialSource: "Atlas CETU",
  referenceVersion: "test",
};

describe("fusion multi-source", () => {
  test("OSM et Wikidata concordants restent un seul ouvrage", () => {
    const osm = {
      ...base,
      name: "Nom OSM",
      provenance: "OSM/Overpass",
      sources: ["OSM/Overpass" as const],
    };
    const result = enrichTunnels([osm], [wiki], []);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual(["OSM/Overpass", "Wikidata"]);
  });

  test("CETU et OSM concordants restent un seul ouvrage", () => {
    const result = enrichTunnels(
      [{ ...base, provenance: "OSM/Overpass", sources: ["OSM/Overpass"] }],
      [],
      [cetu],
    );
    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual(["OSM/Overpass", "CETU"]);
  });

  test("Wikidata proche mais hors seuil n'est pas rattaché", () => {
    const result = enrichTunnels([base], [{ ...wiki, latitude: 45.76 }], []);
    expect(result[0].sources).toEqual(["GraphHopper"]);
  });

  test("priorités CETU > Wikidata > OSM > GraphHopper pour nom et longueur", () => {
    const result = enrichTunnels(
      [
        {
          ...base,
          name: "Nom OSM",
          lengthM: 1850,
          provenance: "OSM/Overpass",
          sources: ["OSM/Overpass"],
        },
      ],
      [wiki],
      [cetu],
    );
    expect(result[0].name).toBe("Nom officiel CETU");
    expect(result[0].lengthM).toBe(1700);
    expect(result[0].lengthSource).toBe("CETU");
    expect(result[0].evidence?.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Nom OSM", "Nom Wikidata", "Nom officiel CETU"]),
    );
  });

  test("PARTIAL et FAILED ont des messages distincts et explicites", () => {
    expect(verificationCopy.PARTIAL).not.toBe(verificationCopy.FAILED);
    expect(verificationCopy.PARTIAL).toContain("tunnels détectés");
  });
});
