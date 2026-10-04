import { describe, expect, test } from "bun:test";
import { getExternalFetchTimeoutMs, tuneGraphHopperRequestBody } from "./network-budget";

describe("budget réseau du calcul d'itinéraire", () => {
  test("borne GraphHopper route à 12 secondes", () => {
    expect(getExternalFetchTimeoutMs("https://graphhopper.com/api/1/route?key=x")).toBe(12_000);
  });

  test("borne le géocodage GraphHopper à 6 secondes", () => {
    expect(getExternalFetchTimeoutMs("https://graphhopper.com/api/1/geocode?q=Paris")).toBe(6_000);
  });

  test("borne OpenRouteService à 12 secondes", () => {
    expect(
      getExternalFetchTimeoutMs(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      ),
    ).toBe(12_000);
  });

  test("ne touche pas aux autres domaines", () => {
    expect(getExternalFetchTimeoutMs("https://query.wikidata.org/sparql")).toBeNull();
  });

  test("réduit les alternatives GraphHopper custom model à deux", () => {
    const input = JSON.stringify({
      algorithm: "alternative_route",
      "alternative_route.max_paths": 4,
      custom_model: { priority: [] },
    });
    const output = tuneGraphHopperRequestBody("https://graphhopper.com/api/1/route?key=x", input);
    expect(JSON.parse(String(output))["alternative_route.max_paths"]).toBe(2);
  });
});
