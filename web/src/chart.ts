import * as Plot from "@observablehq/plot";
import { CONDITION_DOMAIN, CONDITION_LABELS, colorFor, conditionLabel } from "./scales";
import type { Point, Product } from "./types";

export interface Series {
  points: Point[];
  label: string;
}

export interface ChartInput {
  product: Product;
  year: number;
  primary: Series;
  references: Series[];
  // one comparison line is dashed; many (all districts) are drawn as faint context
  referenceStyle: "dashed" | "faint";
  selected: Date | null;
  width: number;
  height: number;
}

const GOLD = "#cfb991";
const MUTED = "#9a9a9a";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

// Same window as the AgMet panels so the two read side by side.
function season(year: number): [Date, Date] {
  return [new Date(Date.UTC(year, 3, 1)), new Date(Date.UTC(year, 10, 30))];
}

function conditionDomain(series: Series[]): [number, number] {
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.min(CONDITION_DOMAIN[0], Math.floor((Math.min(...values) - 0.1) * 2) / 2);
  const hi = Math.max(CONDITION_DOMAIN[1], Math.ceil((Math.max(...values) + 0.1) * 2) / 2);
  return [Math.max(1, lo), Math.min(5, hi)];
}

function tipText(p: Point, product: Product, label: string): string {
  const head = `${label}\nWeek ending ${dateFmt.format(p.date)}`;
  if (product === "cond")
    return `${head}\nCondition ${p.value.toFixed(2)} (${conditionLabel(p.value)})`;
  const dip = p.raw < p.value - 0.0005 ? `\nWeekly value ${p.raw.toFixed(2)}` : "";
  return `${head}\nProgress ${p.value.toFixed(2)}${dip}`;
}

export function renderChart(i: ChartInput): Element {
  const isProg = i.product === "prog";
  const primary = i.primary.points;
  const curve = "monotone-x";
  const dips = isProg ? primary.filter((p) => p.raw < p.value - 0.0005) : [];
  const faint = i.referenceStyle === "faint";

  const condDomain = conditionDomain([i.primary, ...i.references]);
  const y: Plot.ScaleOptions = isProg
    ? { domain: [0, 1], ticks: 5, tickFormat: ".1f", grid: true, label: null }
    : {
        domain: condDomain,
        ticks: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].filter(
          (t) => t >= condDomain[0] && t <= condDomain[1],
        ),
        tickFormat: (v: number) => (Number.isInteger(v) ? (CONDITION_LABELS[v - 1] ?? "") : ""),
        grid: true,
        label: null,
      };

  const refs = i.references.flatMap((s) => s.points.map((p) => ({ ...p, label: s.label })));

  return Plot.plot({
    width: i.width,
    height: i.height,
    marginLeft: isProg ? 34 : 66,
    marginRight: 12,
    marginTop: 10,
    marginBottom: 24,
    style: {
      background: "transparent",
      color: MUTED,
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      fontSize: "11px",
      overflow: "visible",
    },
    x: { type: "utc", domain: season(i.year), ticks: "month", tickFormat: "%b", label: null },
    y,
    marks: [
      Plot.gridX({ ticks: "month", stroke: "#ffffff", strokeOpacity: 0.05 }),
      isProg ? Plot.ruleY([0], { stroke: "#ffffff", strokeOpacity: 0.25 }) : null,
      i.selected
        ? Plot.ruleX([i.selected], {
            stroke: "#eae6e5",
            strokeOpacity: 0.45,
            strokeDasharray: "3 3",
          })
        : null,
      Plot.line(refs, {
        x: "date",
        y: "value",
        z: "label",
        stroke: faint ? "#ffffff" : "#8b8b8b",
        strokeOpacity: faint ? 0.18 : 1,
        strokeWidth: faint ? 1.2 : 1.5,
        strokeDasharray: faint ? undefined : "5 4",
        curve,
      }),
      isProg
        ? Plot.areaY(primary, { x: "date", y: "value", fill: GOLD, fillOpacity: 0.08, curve })
        : null,
      Plot.line(primary, { x: "date", y: "value", stroke: GOLD, strokeWidth: 2.4, curve }),
      Plot.dot(dips, { x: "date", y: "raw", r: 2, fill: MUTED, fillOpacity: 0.8 }),
      Plot.dot(primary, {
        x: "date",
        y: "value",
        r: 2.8,
        fill: isProg ? GOLD : (p: Point) => colorFor("cond", p.value),
        stroke: "#0f0f0f",
        strokeWidth: 1,
      }),
      Plot.tip(
        primary,
        Plot.pointerX({
          x: "date",
          y: "value",
          title: (p: Point) => tipText(p, i.product, i.primary.label),
          fill: "#161616",
          stroke: "#3a3a3a",
          textPadding: 8,
        }),
      ),
    ],
  });
}
