import * as Plot from "@observablehq/plot";
import { CONDITION_LABELS, colorFor } from "./scales";
import type { Point, Product } from "./types";

export interface ChartInput {
  product: Product;
  year: number;
  primary: Point[];
  primaryLabel: string;
  reference: Point[] | null;
  referenceLabel: string;
  selected: Date | null;
  width: number;
}

const GOLD = "#cfb991";
const REF = "#8b8b8b";
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

function tipText(p: Point, product: Product, label: string): string {
  const head = `${label}\nWeek ending ${dateFmt.format(p.date)}`;
  if (product === "cond") {
    const name = CONDITION_LABELS[Math.min(4, Math.max(0, Math.round(p.value) - 1))];
    return `${head}\nCondition ${p.value.toFixed(2)} (${name})`;
  }
  const dip = p.raw < p.value - 0.0005 ? `\nWeekly value ${p.raw.toFixed(2)}` : "";
  return `${head}\nProgress ${p.value.toFixed(2)}${dip}`;
}

export function renderChart(i: ChartInput): Element {
  const isProg = i.product === "prog";
  const y: Plot.ScaleOptions = isProg
    ? { domain: [0, 1], ticks: 5, tickFormat: ".1f", grid: true, label: null }
    : {
        domain: [1, 5],
        ticks: [1, 2, 3, 4, 5],
        tickFormat: (v: number) => CONDITION_LABELS[v - 1] ?? "",
        grid: true,
        label: null,
      };
  const curve = "monotone-x";
  const dips = isProg ? i.primary.filter((p) => p.raw < p.value - 0.0005) : [];

  return Plot.plot({
    width: i.width,
    height: isProg ? 190 : 200,
    marginLeft: isProg ? 34 : 70,
    marginRight: 14,
    marginTop: 12,
    marginBottom: 26,
    style: {
      background: "transparent",
      color: MUTED,
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      fontSize: "11.5px",
      overflow: "visible",
    },
    x: { type: "utc", domain: season(i.year), ticks: "month", tickFormat: "%b", label: null },
    y,
    marks: [
      Plot.gridX({ ticks: "month", stroke: "#ffffff", strokeOpacity: 0.05 }),
      isProg ? Plot.ruleY([0], { stroke: "#ffffff", strokeOpacity: 0.25 }) : null,
      isProg ? null : Plot.ruleY([3], { stroke: "#ffffff", strokeOpacity: 0.2 }),
      i.selected
        ? Plot.ruleX([i.selected], {
            stroke: "#eae6e5",
            strokeOpacity: 0.45,
            strokeDasharray: "3 3",
          })
        : null,
      i.reference
        ? Plot.line(i.reference, {
            x: "date",
            y: "value",
            stroke: REF,
            strokeWidth: 1.5,
            strokeDasharray: "5 4",
            curve,
          })
        : null,
      isProg
        ? Plot.areaY(i.primary, { x: "date", y: "value", fill: GOLD, fillOpacity: 0.1, curve })
        : null,
      Plot.line(i.primary, { x: "date", y: "value", stroke: GOLD, strokeWidth: 2.4, curve }),
      Plot.dot(dips, { x: "date", y: "raw", r: 2.2, fill: MUTED, fillOpacity: 0.8 }),
      Plot.dot(i.primary, {
        x: "date",
        y: "value",
        r: 3.2,
        fill: isProg ? GOLD : (p: Point) => colorFor("cond", p.value),
        stroke: "#0f0f0f",
        strokeWidth: 1,
      }),
      Plot.tip(
        i.primary,
        Plot.pointerX({
          x: "date",
          y: "value",
          title: (p: Point) => tipText(p, i.product, i.primaryLabel),
          fill: "#161616",
          stroke: "#3a3a3a",
          textPadding: 8,
        }),
      ),
    ],
  });
}
