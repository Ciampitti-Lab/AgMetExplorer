import type { FeatureCollection, Geometry } from "geojson";

export type Crop = "corn" | "soybeans";
export type Product = "prog" | "cond";
export type Level = "county" | "district";
export type SeriesLevel = Level | "state";

export type WeekValues = Record<string, number>;

export interface CropSeries {
  prog: WeekValues;
  cond: WeekValues;
}

export type UnitSeries = Partial<Record<Crop, CropSeries>>;

export interface NassWeek {
  week: number;
  week_ending: string;
}

export interface NassData {
  year: number;
  generated: string;
  weeks: NassWeek[];
  county: Record<string, UnitSeries>;
  district: Record<string, UnitSeries>;
  state: Record<string, UnitSeries>;
}

export interface NassIndex {
  years: number[];
  latest: number;
}

export interface AgmetEntry {
  path: string;
  updated: string;
}

export type AgmetManifest = Partial<
  Record<Crop, Partial<Record<Level, Record<string, AgmetEntry>>>>
>;

export interface CountyProps {
  GEOID: string;
  NAME: string;
  ASD_CODE: string;
  ASD_NAME: string;
  SLUG: string;
}

export interface DistrictProps {
  ASD_CODE: string;
  ASD_NAME: string;
  SLUG: string;
}

export type Counties = FeatureCollection<Geometry, CountyProps>;
export type Districts = FeatureCollection<Geometry, DistrictProps>;

export interface Unit {
  id: string;
  level: Level;
  name: string;
  asdCode: string;
  asdName: string;
}

export interface Point {
  week: number;
  date: Date;
  raw: number;
  value: number;
}
