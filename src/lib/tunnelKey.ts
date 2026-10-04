/**
 * Génère une clé stable pour identifier un tunnel à travers les trajets,
 * même si OSM ne lui donne pas de nom. La clé combine nom + position
 * approximative + longueur arrondie + nom de route.
 */
function slug(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface TunnelKeyInput {
  name?: string | null;
  midLat?: number | null;
  midLng?: number | null;
  lengthM?: number | null;
  roadName?: string | null;
}

export function makeTunnelKey(input: TunnelKeyInput): string {
  const lat =
    typeof input.midLat === "number" ? input.midLat.toFixed(3) : "x";
  const lng =
    typeof input.midLng === "number" ? input.midLng.toFixed(3) : "x";
  const len =
    typeof input.lengthM === "number"
      ? String(Math.round(input.lengthM / 10) * 10)
      : "x";
  const name = slug(input.name);
  const road = slug(input.roadName);
  return `t:${name || "anon"}|${lat},${lng}|${len}|${road || "x"}`;
}
