import { renderChart, type Series } from "./chart";
import { parseDate, type AppData } from "./data";
import { UnitMap } from "./map";
import { NO_DATA, colorFor, conditionLabel, gradientCss } from "./scales";
import { readHash, writeHash, type State } from "./state";
import type { Crop, Level, Product, SeriesLevel, Unit } from "./types";

const CROP_NAMES: Record<Crop, string> = { corn: "Corn", soybeans: "Soybeans" };
const PRODUCT_NAMES: Record<Product, string> = { prog: "Progress", cond: "Condition" };
const STATE_ID = "18";
const NASS_DOCS =
  "https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/CropProgressDescription.pdf";

const longDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fmtDate(iso: string): string {
  return longDate.format(parseDate(iso));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

const ICONS = {
  pin: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>`,
  zoom: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm1 2v3h3v2h-3v3H9v-3H6V9h3V6h2Z"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 16.6 5.4 10 6.8 8.6l5.2 5.2 5.2-5.2 1.4 1.4L12 16.6Z"/></svg>`,
};

export class App {
  private state: State;
  private map: UnitMap;
  private weeks: number[];
  private latestWeek: number;
  private playTimer: number | null = null;
  private detail = $("#detail");
  private peek = $("#peek");
  private lightbox = $("#lightbox") as HTMLDialogElement;
  private chartSizes = "";

  constructor(private data: AppData) {
    this.weeks = data.nass.weeks.map((w) => w.week);
    this.latestWeek = this.weeks[this.weeks.length - 1] ?? 0;
    this.state = readHash(this.latestWeek);
    if (!this.weeks.includes(this.state.week)) this.state.week = this.latestWeek;
    if (this.state.unit && !data.units[this.state.level].has(this.state.unit)) {
      this.state.unit = null;
    }

    this.map = new UnitMap($("#map"), data, (id) => this.select(id));
    if (this.state.unit) $(".map-hint").classList.add("is-hidden");
    this.bindControls();
    this.bindDialogs();
    this.bindPeek();
    this.renderStatus();

    new ResizeObserver(() => {
      if (this.measureCharts() !== this.chartSizes) this.renderCharts();
    }).observe(this.detail);

    this.render();
  }

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  private select(id: string | null): void {
    this.set({ unit: id });
    if (id) $(".map-hint").classList.add("is-hidden");
  }

  private unit(): Unit | undefined {
    const { level, unit } = this.state;
    return unit ? this.data.units[level].get(unit) : undefined;
  }

  private render(): void {
    writeHash(this.state, this.latestWeek);
    this.renderControls();
    this.renderMap();
    this.renderLegend();
    this.renderDetail();
    this.renderPeek();
  }

  private value(level: SeriesLevel, id: string, product: Product, week = this.state.week) {
    return this.data.series.at(level, id, this.state.crop, product, week);
  }

  // ---- controls

  private bindControls(): void {
    document.querySelectorAll<HTMLElement>(".seg").forEach((seg) => {
      seg.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
        if (!btn) return;
        const key = seg.dataset.key;
        const value = btn.dataset.value ?? "";
        if (key === "crop") this.set({ crop: value as Crop });
        if (key === "product") this.set({ product: value as Product });
        if (key === "level") this.switchLevel(value as Level);
      });
    });

    const slider = $("#week-slider") as HTMLInputElement;
    slider.min = "0";
    slider.max = String(Math.max(0, this.weeks.length - 1));
    slider.addEventListener("input", () => {
      this.stopPlay();
      this.set({ week: this.weeks[Number(slider.value)] ?? this.latestWeek });
    });
    $("#week-prev").addEventListener("click", () => this.step(-1));
    $("#week-next").addEventListener("click", () => this.step(1));
    $("#week-play").addEventListener("click", () => this.togglePlay());
  }

  private switchLevel(level: Level): void {
    if (level === this.state.level) return;
    const current = this.unit();
    // keep context: a selected county maps to its district
    const unit = current && level === "district" ? current.asdCode : null;
    this.set({ level, unit });
  }

  private step(delta: number): void {
    this.stopPlay();
    const i = this.weeks.indexOf(this.state.week) + delta;
    const week = this.weeks[Math.min(this.weeks.length - 1, Math.max(0, i))];
    if (week !== undefined) this.set({ week });
  }

  private togglePlay(): void {
    if (this.playTimer !== null) return this.stopPlay();
    if (this.state.week === this.latestWeek) this.set({ week: this.weeks[0] ?? this.latestWeek });
    $("#week-play").classList.add("is-playing");
    $("#week-play").setAttribute("aria-label", "Pause");
    this.playTimer = window.setInterval(() => {
      const next = this.weeks[this.weeks.indexOf(this.state.week) + 1];
      if (next === undefined) return this.stopPlay();
      this.set({ week: next });
    }, 650);
  }

  private stopPlay(): void {
    if (this.playTimer !== null) window.clearInterval(this.playTimer);
    this.playTimer = null;
    $("#week-play").classList.remove("is-playing");
    $("#week-play").setAttribute("aria-label", "Play weeks");
  }

  private renderControls(): void {
    const values: Record<string, string> = {
      crop: this.state.crop,
      level: this.state.level,
      product: this.state.product,
    };
    document.querySelectorAll<HTMLElement>(".seg").forEach((seg) => {
      const current = values[seg.dataset.key ?? ""];
      seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.value === current));
      });
    });

    const i = this.weeks.indexOf(this.state.week);
    ($("#week-slider") as HTMLInputElement).value = String(i);
    const w = this.data.nass.weeks[i];
    $("#week-label").innerHTML = w
      ? `<span class="wk-date">${fmtDate(w.week_ending)}</span><span class="wk-num">Week ${w.week}</span>`
      : "";
    ($("#week-prev") as HTMLButtonElement).disabled = i <= 0;
    ($("#week-next") as HTMLButtonElement).disabled = i >= this.weeks.length - 1;
  }

  // ---- map

  private renderMap(): void {
    const { level, product } = this.state;
    this.map.render({
      level,
      selected: this.state.unit,
      fill: (id) => colorFor(product, this.value(level, id, product)?.value),
      label: (id) => {
        const p = this.value(level, id, product);
        return p ? p.value.toFixed(2).replace(/^0/, "") : "";
      },
      tooltip: (id) => {
        const u = this.data.units[level].get(id);
        const p = this.value(level, id, product);
        const value = p
          ? product === "cond"
            ? `${p.value.toFixed(2)} <span>${conditionLabel(p.value)}</span>`
            : p.value.toFixed(2)
          : "<span>No data this week</span>";
        return `<strong>${esc(u?.name ?? id)}</strong><em>${PRODUCT_NAMES[product]} ${value}</em>`;
      },
    });
  }

  private renderLegend(): void {
    const { product, crop } = this.state;
    const ticks =
      product === "prog"
        ? `<span>0 none planted</span><span>0.25</span><span>0.5</span><span>0.75</span><span>1 harvested</span>`
        : `<span>≤2.5</span><span>3 Fair</span><span>3.5</span><span>4 Good</span><span>≥4.5</span>`;
    const step = product === "prog" ? "0.05" : "0.1";
    $("#legend").innerHTML = `
      <div class="legend-title">${CROP_NAMES[crop]} ${PRODUCT_NAMES[product].toLowerCase()} index</div>
      <div class="legend-step">Bands of ${step}</div>
      <div class="legend-bar" style="background:${gradientCss(product)}"></div>
      <div class="legend-ticks">${ticks}</div>
      <div class="legend-nodata"><i style="background:${NO_DATA}"></i>No data</div>`;
  }

  // ---- detail panel

  private agmetUpdated(crop: Crop): string | null {
    const levels = this.data.agmet[crop];
    if (!levels) return null;
    const dates = Object.values(levels).flatMap((m) =>
      Object.values(m ?? {}).map((e) => e.updated),
    );
    return dates.sort().pop() ?? null;
  }

  private pickerHtml(): string {
    const { level, unit } = this.state;
    const units = [...this.data.units[level].values()].sort((a, b) => a.name.localeCompare(b.name));
    const options = units
      .map(
        (u) => `<option value="${u.id}" ${u.id === unit ? "selected" : ""}>${esc(u.name)}</option>`,
      )
      .join("");
    const noun = level === "county" ? "county" : "district";
    return `<label class="picker"><span class="sr-only">Choose a ${noun}</span>
      <select data-picker><option value="" ${unit ? "" : "selected"}>Find a ${noun}…</option>${options}</select>
    </label>`;
  }

  private statsHtml(level: SeriesLevel, id: string, compare: Unit | null): string {
    const { crop, week } = this.state;
    const s = this.data.series;
    const tile = (product: Product): string => {
      const now = s.at(level, id, crop, product, week);
      const prev = s.before(level, id, crop, product, week);
      const ref = compare ? s.at("state", STATE_ID, crop, product, week) : undefined;
      let delta = "";
      if (now && prev) {
        const d = now.value - prev.value;
        const sign = d > 0.0005 ? "+" : d < -0.0005 ? "−" : "±";
        delta = `<span class="stat-delta">${sign}${Math.abs(d).toFixed(2)} wk/wk</span>`;
      }
      const refHtml = ref ? `<span class="stat-ref">Indiana ${ref.value.toFixed(2)}</span>` : "";
      const chip =
        product === "cond" && now
          ? `<span class="chip" style="--chip:${colorFor("cond", now.value)}">${conditionLabel(now.value)}</span>`
          : "";
      const fill = now ? colorFor(product, now.value) : "transparent";
      const pct = now ? (product === "prog" ? now.value : (now.value - 1) / 4) * 100 : 0;
      return `<div class="stat">
          <span class="stat-label">${PRODUCT_NAMES[product]}${product === "prog" ? " index" : ""}</span>
          <span class="stat-value">${now ? now.value.toFixed(2) : "–"}${chip}</span>
          <span class="stat-meta">${delta}${refHtml}</span>
          <div class="meter"><span style="width:${pct}%;background:${fill}"></span></div>
        </div>`;
    };
    return `<div class="stats">${tile("prog")}${tile("cond")}</div>`;
  }

  private weekNote(): string {
    const w = this.data.nass.weeks.find((x) => x.week === this.state.week);
    return w ? `Week ending ${fmtDate(w.week_ending)}` : "";
  }

  private renderDetail(): void {
    const u = this.unit();
    this.detail.classList.toggle("is-overview", !u);
    this.detail.innerHTML = u ? this.unitHtml(u) : this.overviewHtml();

    this.detail
      .querySelector<HTMLSelectElement>("[data-picker]")
      ?.addEventListener("change", (e) => {
        const id = (e.target as HTMLSelectElement).value;
        this.select(id || null);
      });
    this.detail.querySelector("[data-clear]")?.addEventListener("click", () => this.select(null));
    this.detail.querySelector("[data-goto-district]")?.addEventListener("click", () => {
      if (u) this.set({ level: "district", unit: u.asdCode });
    });
    this.detail.querySelectorAll<HTMLElement>("[data-district]").forEach((el) => {
      el.addEventListener("click", () => {
        $(".map-hint").classList.add("is-hidden");
        this.set({ level: "district", unit: el.dataset.district ?? null });
      });
    });
    this.detail.querySelector<HTMLButtonElement>(".agmet-thumb")?.addEventListener("click", (e) => {
      const path = (e.currentTarget as HTMLElement).dataset.full ?? "";
      if (u) this.openLightbox(path, `${u.name}, ${CROP_NAMES[this.state.crop].toLowerCase()}`);
    });
    this.renderCharts();
  }

  private chartsHtml(keyHtml: string): string {
    const card = (product: Product, title: string, hint: string) => `
      <section class="card chart-card">
        <header class="card-head">
          <h3>${title}</h3>
          <span class="info" tabindex="0" aria-label="${hint}" data-hint="${hint}">?</span>
          ${keyHtml}
        </header>
        <div class="chart" data-chart="${product}"></div>
      </section>`;
    return `<div class="charts">
      ${card("prog", "Crop progress", "Index from 0 (none planted) to 1 (all harvested), shown as a running maximum. Grey dots mark weekly values that dipped.")}
      ${card("cond", "Crop condition", "Index from 1 (very poor) to 5 (excellent), weighted from the share of acres in each rating.")}
    </div>`;
  }

  private unitHtml(u: Unit): string {
    const { crop, level } = this.state;
    const agmet = this.data.agmet[crop]?.[level]?.[u.id];
    const agmetHtml = agmet
      ? `<button class="agmet-thumb" type="button" data-full="${esc(agmet.path)}" aria-label="Enlarge AgMet graphic">
           <img src="${import.meta.env.BASE_URL}agmet/${esc(agmet.path)}" alt="AgMet graphic for ${esc(u.name)}, ${CROP_NAMES[crop].toLowerCase()}" width="2000" height="1000" />
           <span class="zoom-hint">${ICONS.zoom}Enlarge</span>
         </button>`
      : `<div class="unavailable">No AgMet graphic is available for this ${level} and crop yet.</div>`;

    const crumb =
      level === "county"
        ? `County in <button class="link" data-goto-district>${esc(u.asdName)} district</button>`
        : "Agricultural statistics district";
    const refName = level === "county" ? `${u.asdName} district` : "Indiana";
    const key = `<span class="series-key"><i class="k-main"></i>${esc(u.name.replace(/ (County|District)$/, ""))}<i class="k-ref"></i>${esc(refName)}</span>`;

    return `
      <div class="d-head">
        <div class="d-title">
          <p class="eyebrow">${crumb}</p>
          <h2>${esc(u.name)}</h2>
          <p class="d-sub">${CROP_NAMES[crop]}, ${this.weekNote().replace("Week", "week")}</p>
        </div>
        ${this.statsHtml(level, u.id, u)}
        <div class="head-tools">
          ${this.pickerHtml()}
          <button class="icon-btn" data-clear aria-label="Back to Indiana overview" title="Back to Indiana overview">${ICONS.close}</button>
        </div>
      </div>
      <section class="card agmet-card">
        <header class="card-head">
          <h3>AgMet graphic</h3>
          <span class="muted">NASA Harvest${agmet ? `, updated ${fmtDate(agmet.updated)}` : ""}</span>
        </header>
        ${agmetHtml}
      </section>
      ${this.chartsHtml(key)}`;
  }

  private overviewHtml(): string {
    const { crop, product } = this.state;
    const tiles = [...this.data.units.district.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => {
        const prog = this.value("district", d.id, "prog");
        const cond = this.value("district", d.id, "cond");
        const active = product === "prog" ? prog : cond;
        return `<button class="d-tile" type="button" data-district="${d.id}" style="--tile:${colorFor(product, active?.value)}">
          <span class="d-name">${esc(d.asdName)}</span>
          <span class="d-metrics">
            <span><small>Progress</small>${prog ? prog.value.toFixed(2) : "–"}</span>
            <span><small>Condition</small>${cond ? cond.value.toFixed(2) : "–"}</span>
          </span>
        </button>`;
      })
      .join("");
    const key = `<span class="series-key"><i class="k-main"></i>Indiana<i class="k-faint"></i>Districts</span>`;

    return `
      <div class="d-head">
        <div class="d-title">
          <p class="eyebrow">${ICONS.pin} Statewide overview</p>
          <h2>Indiana</h2>
          <p class="d-sub">${CROP_NAMES[crop]}, ${this.weekNote().replace("Week", "week")}</p>
        </div>
        ${this.statsHtml("state", STATE_ID, null)}
        <div class="head-tools">${this.pickerHtml()}</div>
      </div>
      <section class="card districts-card">
        <header class="card-head">
          <h3>Agricultural statistics districts</h3>
          <span class="muted">Laid out as on the map. Select one for its AgMet graphic.</span>
        </header>
        <div class="d-grid">${tiles}</div>
      </section>
      ${this.chartsHtml(key)}`;
  }

  private measureCharts(): string {
    return [...this.detail.querySelectorAll<HTMLElement>(".chart")]
      .map((el) => `${el.clientWidth}x${el.clientHeight}`)
      .join(",");
  }

  private renderCharts(): void {
    const u = this.unit();
    const { crop, week } = this.state;
    const s = this.data.series;
    const wk = this.data.nass.weeks.find((x) => x.week === week);
    for (const product of ["prog", "cond"] as const) {
      const el = this.detail.querySelector<HTMLElement>(`[data-chart="${product}"]`);
      if (!el) continue;
      let primary: Series;
      let references: Series[];
      if (u) {
        primary = { label: u.name, points: s.get(u.level, u.id, crop, product) };
        references =
          u.level === "county"
            ? [
                {
                  label: `${u.asdName} district`,
                  points: s.get("district", u.asdCode, crop, product),
                },
              ]
            : [{ label: "Indiana", points: s.get("state", STATE_ID, crop, product) }];
      } else {
        primary = { label: "Indiana", points: s.get("state", STATE_ID, crop, product) };
        references = [...this.data.units.district.values()].map((d) => ({
          label: d.name,
          points: s.get("district", d.id, crop, product),
        }));
      }
      if (!primary.points.length) {
        el.innerHTML = `<div class="unavailable">No ${PRODUCT_NAMES[product].toLowerCase()} data reported yet this season.</div>`;
        continue;
      }
      el.replaceChildren(
        renderChart({
          product,
          year: this.data.nass.year,
          primary,
          references,
          referenceStyle: u ? "dashed" : "faint",
          selected: wk ? parseDate(wk.week_ending) : null,
          width: Math.max(240, el.clientWidth),
          height: Math.max(110, Math.min(420, el.clientHeight || 200)),
        }),
      );
    }
    this.chartSizes = this.measureCharts();
  }

  // ---- header, dialogs, mobile peek bar

  private renderStatus(): void {
    const last = this.data.nass.weeks[this.data.nass.weeks.length - 1];
    const agmet = [this.agmetUpdated("corn"), this.agmetUpdated("soybeans")]
      .filter((d): d is string => d !== null)
      .sort()
      .pop();
    $("#status").innerHTML = `
      <span><i class="dot"></i>NASS through week ${last?.week ?? "–"}${
        last ? ` (${fmtDate(last.week_ending)})` : ""
      }</span>
      <span><i class="dot alt"></i>AgMet updated ${agmet ? fmtDate(agmet) : "–"}</span>`;
    $("#nass-docs").setAttribute("href", NASS_DOCS);
  }

  private bindDialogs(): void {
    const box = this.lightbox;
    const scroller = box.querySelector<HTMLElement>(".lb-scroll");
    const toggleZoom = () => scroller?.classList.toggle("is-zoomed");
    box.querySelector("[data-zoom]")?.addEventListener("click", toggleZoom);
    box.querySelector("img")?.addEventListener("click", toggleZoom);

    const about = $("#about") as HTMLDialogElement;
    $("#about-open").addEventListener("click", () => {
      document.body.classList.add("no-scroll");
      about.showModal();
    });

    for (const dialog of [box, about]) {
      dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => document.body.classList.remove("no-scroll"));
    }
  }

  private openLightbox(path: string, title: string): void {
    const box = this.lightbox;
    const img = box.querySelector("img");
    const scroller = box.querySelector<HTMLElement>(".lb-scroll");
    const url = `${import.meta.env.BASE_URL}agmet/${path}`;
    if (img) {
      img.src = url;
      img.alt = `AgMet graphic, ${title}`;
    }
    const heading = box.querySelector(".lb-title");
    if (heading) heading.textContent = title;
    const open = box.querySelector<HTMLAnchorElement>("[data-open]");
    if (open) open.href = url;
    // phones start zoomed in; the 3x3 panel is unreadable at screen width
    scroller?.classList.toggle("is-zoomed", window.innerWidth < 700);
    document.body.classList.add("no-scroll");
    box.showModal();
  }

  private bindPeek(): void {
    new IntersectionObserver(
      (entries) => {
        this.peek.classList.toggle(
          "is-hidden",
          entries.some((e) => e.isIntersecting),
        );
      },
      { threshold: 0.05 },
    ).observe(this.detail);
    this.peek.addEventListener("click", () => {
      this.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  private renderPeek(): void {
    const u = this.unit();
    this.peek.hidden = !u;
    if (!u) return;
    const { level, product } = this.state;
    const p = this.value(level, u.id, product);
    const value = p
      ? `${PRODUCT_NAMES[product]} ${p.value.toFixed(2)}${product === "cond" ? ` (${conditionLabel(p.value)})` : ""}`
      : "No data this week";
    this.peek.innerHTML = `<span class="peek-name">${esc(u.name)}</span><span class="peek-val">${value}</span><span class="peek-cta">Details${ICONS.down}</span>`;
  }
}
