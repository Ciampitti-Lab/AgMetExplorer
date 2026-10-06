import type { Product } from "./types";

type Stop = [number, string];

// Fixed domains so colors mean the same thing every week.
export const PROGRESS_STOPS: Stop[] = [
  [0, "#26302a"],
  [0.25, "#35603f"],
  [0.5, "#5f8f48"],
  [0.75, "#a9ab5a"],
  [1, "#ecdcaf"],
];

export const CONDITION_STOPS: Stop[] = [
  [1, "#7f2f1a"],
  [2, "#c06a35"],
  [3, "#d8cdb4"],
  [4, "#4f9d93"],
  [5, "#155f6b"],
];

export const NO_DATA = "#1d1d1d";

export const CONDITION_LABELS = ["Very poor", "Poor", "Fair", "Good", "Excellent"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolate(stops: Stop[], v: number): string {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return NO_DATA;
  if (v <= first[0]) return first[1];
  if (v >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i];
    const lo = stops[i - 1];
    if (!hi || !lo || v > hi[0]) continue;
    const t = (v - lo[0]) / (hi[0] - lo[0]);
    const a = hexToRgb(lo[1]);
    const b = hexToRgb(hi[1]);
    const c = a.map((x, k) => Math.round(x + ((b[k] ?? x) - x) * t));
    return `rgb(${c.join(",")})`;
  }
  return last[1];
}

export function colorFor(product: Product, v: number | undefined): string {
  if (v === undefined) return NO_DATA;
  return interpolate(product === "prog" ? PROGRESS_STOPS : CONDITION_STOPS, v);
}

export function gradientCss(product: Product): string {
  const stops = product === "prog" ? PROGRESS_STOPS : CONDITION_STOPS;
  const [lo, hi] = product === "prog" ? [0, 1] : [1, 5];
  const parts = stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo)) * 100}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export function conditionLabel(v: number): string {
  const i = Math.min(4, Math.max(0, Math.round(v) - 1));
  return CONDITION_LABELS[i] ?? "";
}
