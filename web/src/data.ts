import type {
  AgmetManifest,
  Counties,
  Crop,
  Districts,
  Level,
  NassData,
  NassIndex,
  Point,
  Product,
  SeriesLevel,
  Unit,
} from "./types";

const BASE = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function getOptional<T>(path: string, fallback: T): Promise<T> {
  try {
    return await getJson<T>(path);
  } catch {
    return fallback;
  }
}

export interface AppData {
  nass: NassData;
  agmet: AgmetManifest;
  counties: Counties;
  districts: Districts;
  units: Record<Level, Map<string, Unit>>;
  series: SeriesStore;
}

export async function loadData(): Promise<AppData> {
  const index = await getJson<NassIndex>("data/index.json");
  const [nass, agmet, counties, districts] = await Promise.all([
    getJson<NassData>(`data/nass_${index.latest}.json`),
    getOptional<AgmetManifest>("agmet/manifest.json", {}),
    getJson<Counties>("boundaries/counties.geojson"),
    getJson<Districts>("boundaries/districts.geojson"),
  ]);

  const county = new Map<string, Unit>();
  for (const f of counties.features) {
    const p = f.properties;
    county.set(p.GEOID, {
      id: p.GEOID,
      level: "county",
      name: `${p.NAME} County`,
      asdCode: p.ASD_CODE,
      asdName: p.ASD_NAME,
    });
  }
  const district = new Map<string, Unit>();
  for (const f of districts.features) {
    const p = f.properties;
    district.set(p.ASD_CODE, {
      id: p.ASD_CODE,
      level: "district",
      name: `${p.ASD_NAME} District`,
      asdCode: p.ASD_CODE,
      asdName: p.ASD_NAME,
    });
  }

  return {
    nass,
    agmet,
    counties,
    districts,
    units: { county, district },
    series: new SeriesStore(nass),
  };
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** Weekly points per unit; progress gets a running max since each week is kriged independently. */
export class SeriesStore {
  private cache = new Map<string, Point[]>();
  private dates = new Map<number, Date>();

  constructor(private nass: NassData) {
    for (const w of nass.weeks) this.dates.set(w.week, parseDate(w.week_ending));
  }

  get(level: SeriesLevel, id: string, crop: Crop, product: Product): Point[] {
    const key = `${level}|${id}|${crop}|${product}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const values = this.nass[level]?.[id]?.[crop]?.[product] ?? {};
    const weeks = Object.keys(values)
      .map(Number)
      .sort((a, b) => a - b);
    let runMax = -Infinity;
    const points: Point[] = [];
    for (const week of weeks) {
      const raw = values[String(week)];
      const date = this.dates.get(week);
      if (raw === undefined || !date) continue;
      runMax = Math.max(runMax, raw);
      points.push({ week, date, raw, value: product === "prog" ? runMax : raw });
    }
    this.cache.set(key, points);
    return points;
  }

  at(
    level: SeriesLevel,
    id: string,
    crop: Crop,
    product: Product,
    week: number,
  ): Point | undefined {
    return this.get(level, id, crop, product).find((p) => p.week === week);
  }

  /** Last point at or before the given week, used for week-over-week change. */
  before(
    level: SeriesLevel,
    id: string,
    crop: Crop,
    product: Product,
    week: number,
  ): Point | undefined {
    const pts = this.get(level, id, crop, product).filter((p) => p.week < week);
    return pts[pts.length - 1];
  }
}
