import { palette } from "./theme";
import type { Product } from "./types";

type Stop = [number, string];

interface Scale {
  domain: [number, number];
  // width of one color band; neighbors a band apart get clearly different colors
  step: number;
  stops: Stop[];
}

// One fixed scale per product, identical every week. Condition is clamped to 2.5-4.5
// because county indices rarely leave that band and the full 1-5 range washes out the map.
const SCALES: Record<Product, Scale> = {
  prog: {
    domain: [0, 1],
    step: 0.05,
    stops: [
      [0, "#2d1e4f"],
      [0.15, "#3b4c8c"],
      [0.3, "#2b7f8e"],
      [0.45, "#2fa77a"],
      [0.6, "#8fca4e"],
      [0.7, "#f0d35a"],
      [0.8, "#f39c3c"],
      [0.9, "#e0573a"],
      [1, "#b8273a"],
    ],
  },
  cond: {
    domain: [2.5, 4.5],
    step: 0.1,
    // packed between 3 and 4, where county condition indices usually sit
    stops: [
      [2.5, "#7a1f12"],
      [3, "#d0582c"],
      [3.3, "#f0a050"],
      [3.5, "#f3e7c4"],
      [3.7, "#8fd0c0"],
      [3.9, "#3a9e9a"],
      [4.2, "#1d6f8a"],
      [4.5, "#243f7a"],
    ],
  },
};

export const CONDITION_DOMAIN = SCALES.cond.domain;

export function noDataColor(): string {
  return palette().noFill;
}

export const CONDITION_LABELS = ["Very poor", "Poor", "Fair", "Good", "Excellent"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolate(stops: Stop[], v: number): string {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return noDataColor();
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

function bandCount(s: Scale): number {
  return Math.round((s.domain[1] - s.domain[0]) / s.step);
}

function bandColor(s: Scale, band: number): string {
  return interpolate(s.stops, s.domain[0] + (band + 0.5) * s.step);
}

export function colorFor(product: Product, v: number | undefined): string {
  if (v === undefined) return noDataColor();
  const s = SCALES[product];
  const band = Math.floor((v - s.domain[0]) / s.step);
  return bandColor(s, Math.min(bandCount(s) - 1, Math.max(0, band)));
}

/** Stepped legend gradient that matches the map bands exactly. */
export function gradientCss(product: Product): string {
  const s = SCALES[product];
  const n = bandCount(s);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = bandColor(s, i);
    parts.push(`${c} ${(i / n) * 100}%`, `${c} ${((i + 1) / n) * 100}%`);
  }
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export function conditionLabel(v: number): string {
  const i = Math.min(4, Math.max(0, Math.round(v) - 1));
  return CONDITION_LABELS[i] ?? "";
}
