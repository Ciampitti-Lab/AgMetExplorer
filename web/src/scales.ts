import type { Product } from "./types";

type Stop = [number, string];

// Fixed domains so colors mean the same thing every week. Condition is clamped to 2.5-4.5
// because county indices rarely leave that band and the full 1-5 range washes out the map.
export const PROGRESS_DOMAIN: [number, number] = [0, 1];
export const CONDITION_DOMAIN: [number, number] = [2.5, 4.5];

// Smooth ramps for the fixed scale and playback, so the season fades instead of flickering.
export const PROGRESS_STOPS: Stop[] = [
  [0, "#1f3a2e"],
  [0.25, "#2f6b45"],
  [0.5, "#6f9a45"],
  [0.75, "#c6b35a"],
  [1, "#f1e2b0"],
];

export const CONDITION_STOPS: Stop[] = [
  [2.5, "#9a3b22"],
  [3, "#d07a45"],
  [3.5, "#e7dcc0"],
  [4, "#5aa79c"],
  [4.5, "#1f6a77"],
];

// Sharp ramps with many hue steps for a single week stretched to its own range, where
// neighbors differ by a few hundredths.
const PROGRESS_SHARP: Stop[] = [
  [0, "#2d1e4f"],
  [0.15, "#3b4c8c"],
  [0.3, "#2b7f8e"],
  [0.45, "#2fa77a"],
  [0.6, "#8fca4e"],
  [0.7, "#f0d35a"],
  [0.8, "#f39c3c"],
  [0.9, "#e0573a"],
  [1, "#b8273a"],
];

const CONDITION_SHARP: Stop[] = [
  [2.5, "#7a1f12"],
  [3, "#d0582c"],
  [3.3, "#f0a050"],
  [3.5, "#f3e7c4"],
  [3.7, "#8fd0c0"],
  [3.9, "#3a9e9a"],
  [4.2, "#1d6f8a"],
  [4.5, "#243f7a"],
];

function stopsFor(product: Product, sharp: boolean): Stop[] {
  if (product === "prog") return sharp ? PROGRESS_SHARP : PROGRESS_STOPS;
  return sharp ? CONDITION_SHARP : CONDITION_STOPS;
}

export const NO_DATA = "#2a2a2a";

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
  return interpolate(stopsFor(product, false), v);
}

/** Color by position within [lo, hi], e.g. this week's lowest and highest unit. */
export function colorRelative(
  product: Product,
  v: number | undefined,
  lo: number,
  hi: number,
): string {
  if (v === undefined) return NO_DATA;
  const t = hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo);
  const [d0, d1] = product === "prog" ? PROGRESS_DOMAIN : CONDITION_DOMAIN;
  return interpolate(stopsFor(product, true), d0 + t * (d1 - d0));
}

export function gradientCss(product: Product, sharp: boolean): string {
  const stops = stopsFor(product, sharp);
  const [lo, hi] = product === "prog" ? PROGRESS_DOMAIN : CONDITION_DOMAIN;
  const parts = stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo)) * 100}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export function conditionLabel(v: number): string {
  const i = Math.min(4, Math.max(0, Math.round(v) - 1));
  return CONDITION_LABELS[i] ?? "";
}

/** Dark or light text for a label drawn on top of a fill color. */
export function labelColor(fill: string): string {
  const m = fill.match(/\d+/g);
  const rgb = fill.startsWith("#") ? hexToRgb(fill) : (m ?? []).slice(0, 3).map(Number);
  const [r = 0, g = 0, b = 0] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#f4f1ea";
}
