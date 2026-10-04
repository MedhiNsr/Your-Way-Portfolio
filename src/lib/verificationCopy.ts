import type { VerificationStatus } from "./tunnels";

export const verificationCopy: Record<VerificationStatus, string> = {
  VERIFIED: "Cartographie locale OSM vérifiée pour cet itinéraire.",
  PARTIAL:
    "Cartographie locale vérifiée partiellement. Les tunnels détectés dans les secteurs couverts sont affichés.",
  FAILED: "La vérification cartographique n’a pas pu être réalisée.",
};
