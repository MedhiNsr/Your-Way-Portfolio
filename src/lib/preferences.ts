import { useEffect, useState } from "react";

/** Max tunnel length tolerance. `null` = no limit. 0 = no tunnel at all. */
export type MaxLength = null | 0 | 100 | 300 | 800 | 1500;
/** Max total time spent in tunnels (seconds). `null` = no limit. */
export type MaxTotalSec = null | 60 | 180 | 600;

export interface Preferences {
  /** Hard max for the longest tunnel allowed on a route (meters). */
  maxTunnelLengthM: MaxLength;
  /** Hard max for cumulative time spent in tunnels (seconds). */
  maxTotalTunnelSec: MaxTotalSec;
  /** Prefer open / covered passages over fully closed tunnels. */
  avoidClosed: boolean;
  /** Recommend the tunnel-free option even when slower. */
  preferTunnelFree: boolean;
}

const KEY = "yourway.preferences.v1";
const DEFAULT: Preferences = {
  maxTunnelLengthM: null,
  maxTotalTunnelSec: null,
  avoidClosed: false,
  preferTunnelFree: true,
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export function savePreferences(p: Preferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT);
  useEffect(() => setPrefs(loadPreferences()), []);
  const update = (next: Preferences) => {
    setPrefs(next);
    savePreferences(next);
  };
  return [prefs, update] as const;
}

export const maxLengthOptions: Array<{ value: MaxLength; label: string }> = [
  { value: null, label: "Sans préférence" },
  { value: 1500, label: "Max 1,5 km" },
  { value: 800, label: "Max 800 m" },
  { value: 300, label: "Max 300 m" },
  { value: 100, label: "Max 100 m" },
  { value: 0, label: "Aucun tunnel" },
];

export const maxTotalOptions: Array<{ value: MaxTotalSec; label: string }> = [
  { value: null, label: "Sans limite" },
  { value: 600, label: "≤ 10 min" },
  { value: 180, label: "≤ 3 min" },
  { value: 60, label: "≤ 1 min" },
];

export function maxLengthLabel(v: MaxLength): string {
  return maxLengthOptions.find((o) => o.value === v)?.label ?? "Sans préférence";
}

export function maxTotalLabel(v: MaxTotalSec): string {
  return maxTotalOptions.find((o) => o.value === v)?.label ?? "Sans limite";
}

export interface RouteStats {
  longestTunnelM: number;
  totalTunnelSec: number;
  tunnels: { length: number };
  closedTunnelCount: number;
  trulyTunnelFree?: boolean;
}

export function routePassesStrict(r: RouteStats, p: Preferences): boolean {
  if (p.maxTunnelLengthM !== null) {
    if (p.maxTunnelLengthM === 0) {
      if (r.tunnels.length > 0) return false;
      // Strict "Aucun tunnel" also requires high-certainty verification.
      if (r.trulyTunnelFree === false) return false;
    }
    if (p.maxTunnelLengthM > 0 && r.longestTunnelM > p.maxTunnelLengthM) return false;
  }
  if (p.maxTotalTunnelSec !== null && r.totalTunnelSec > p.maxTotalTunnelSec) {
    return false;
  }
  if (p.avoidClosed && r.closedTunnelCount > 0) return false;
  return true;
}
