import * as Plot from "@observablehq/plot";
import { CONDITION_DOMAIN, CONDITION_LABELS, colorFor, conditionLabel } from "./scales";
import { palette } from "./theme";
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
  const c = palette();

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
      color: c.muted,
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      fontSize: "11px",
      overflow: "visible",
    },
    x: { type: "utc", domain: season(i.year), ticks: "month", tickFormat: "%b", label: null },
    y,
    marks: [
      Plot.gridX({ ticks: "month", stroke: c.grid, strokeOpacity: 1 }),
      isProg ? Plot.ruleY([0], { stroke: c.axis }) : null,
      i.selected
        ? Plot.ruleX([i.selected], {
            stroke: c.cursor,
            strokeDasharray: "3 3",
          })
        : null,
      Plot.line(refs, {
        x: "date",
        y: "value",
        z: "label",
        stroke: faint ? c.faint : c.reference,
        strokeWidth: faint ? 1.2 : 1.5,
        strokeDasharray: faint ? undefined : "5 4",
        curve,
      }),
      isProg
        ? Plot.areaY(primary, { x: "date", y: "value", fill: c.primary, fillOpacity: 0.1, curve })
        : null,
      Plot.line(primary, { x: "date", y: "value", stroke: c.primary, strokeWidth: 2.4, curve }),
      Plot.dot(dips, { x: "date", y: "raw", r: 2, fill: c.muted, fillOpacity: 0.8 }),
      Plot.dot(primary, {
        x: "date",
        y: "value",
        r: 2.8,
        fill: isProg ? c.primary : (p: Point) => colorFor("cond", p.value),
        stroke: c.dotStroke,
        strokeWidth: 1,
      }),
      Plot.tip(
        primary,
        Plot.pointerX({
          x: "date",
          y: "value",
          title: (p: Point) => tipText(p, i.product, i.primary.label),
          fill: c.tipFill,
          stroke: c.tipStroke,
          textPadding: 8,
        }),
      ),
    ],
  });
}
