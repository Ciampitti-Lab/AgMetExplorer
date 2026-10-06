import type { Crop, Level, Product } from "./types";

export interface State {
  crop: Crop;
  level: Level;
  product: Product;
  week: number;
  unit: string | null;
}

const CROPS: readonly Crop[] = ["corn", "soybeans"];
const LEVELS: readonly Level[] = ["county", "district"];
const PRODUCTS: readonly Product[] = ["prog", "cond"];

function pick<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((o) => o === value) ?? fallback;
}

export function readHash(latestWeek: number): State {
  const p = new URLSearchParams(location.hash.slice(1));
  const week = Number(p.get("week"));
  return {
    crop: pick(p.get("crop"), CROPS, "corn"),
    level: pick(p.get("level"), LEVELS, "county"),
    product: pick(p.get("layer"), PRODUCTS, "prog"),
    week: Number.isInteger(week) && week > 0 ? week : latestWeek,
    unit: p.get("unit"),
  };
}

export function writeHash(s: State, latestWeek: number): void {
  const p = new URLSearchParams({ crop: s.crop, level: s.level, layer: s.product });
  if (s.week !== latestWeek) p.set("week", String(s.week));
  if (s.unit) p.set("unit", s.unit);
  history.replaceState(null, "", `#${p.toString()}`);
}
