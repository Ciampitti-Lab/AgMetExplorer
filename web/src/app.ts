import { renderChart } from "./chart";
import { parseDate, type AppData } from "./data";
import { UnitMap } from "./map";
import { CONDITION_LABELS, NO_DATA, colorFor, conditionLabel, gradientCss } from "./scales";
import { readHash, writeHash, type State } from "./state";
import type { Crop, Level, Product, Unit } from "./types";

const CROP_NAMES: Record<Crop, string> = { corn: "Corn", soybeans: "Soybeans" };
const PRODUCT_NAMES: Record<Product, string> = { prog: "Progress", cond: "Condition" };
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

export class App {
  private state: State;
  private map: UnitMap;
  private weeks: number[];
  private latestWeek: number;
  private playTimer: number | null = null;
  private detail = $("#detail");
  private peek = $("#peek");
  private lightbox = $("#lightbox") as HTMLDialogElement;
  private chartWidth = 0;

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
    this.bindLightbox();
    this.bindPeek();
    this.renderStatus();

    new ResizeObserver(() => {
      const w = this.chartContainerWidth();
      if (Math.abs(w - this.chartWidth) > 4) this.renderDetail();
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
      const i = this.weeks.indexOf(this.state.week);
      const next = this.weeks[i + 1];
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
    const { level, crop, product, week } = this.state;
    const s = this.data.series;
    this.map.render({
      level,
      selected: this.state.unit,
      fill: (id) => colorFor(product, s.at(level, id, crop, product, week)?.value),
      tooltip: (id) => {
        const u = this.data.units[level].get(id);
        const p = s.at(level, id, crop, product, week);
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
        ? `<span>0 · none planted</span><span>1 · all harvested</span>`
        : CONDITION_LABELS.map((l) => `<span>${l.replace("Very poor", "V. poor")}</span>`).join("");
    $("#legend").innerHTML = `
      <div class="legend-title">${CROP_NAMES[crop]} ${PRODUCT_NAMES[product].toLowerCase()}${
        product === "prog" ? " index" : ""
      }</div>
      <div class="legend-bar" style="background:${gradientCss(product)}"></div>
      <div class="legend-ticks ${product}">${ticks}</div>
      <div class="legend-nodata"><i style="background:${NO_DATA}"></i>No data</div>`;
  }

  // ---- detail panel

  private chartContainerWidth(): number {
    const card = this.detail.querySelector<HTMLElement>(".chart");
    return Math.round(card?.clientWidth ?? this.detail.clientWidth - 32);
  }

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
      <select data-picker><option value="" ${unit ? "" : "selected"} disabled>Choose a ${noun}…</option>${options}</select>
    </label>`;
  }

  private renderDetail(): void {
    const u = this.unit();
    if (!u) {
      this.detail.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>
          </div>
          <h2>Select a ${this.state.level === "county" ? "county" : "district"} on the map</h2>
          <p>See NASS crop progress and condition for the area next to its AgMet graphic of vegetation, rainfall, soil moisture and temperature.</p>
          ${this.pickerHtml()}
        </div>`;
      this.bindPicker();
      return;
    }

    const { crop, level, week } = this.state;
    const s = this.data.series;
    const prog = s.at(level, u.id, crop, "prog", week);
    const cond = s.at(level, u.id, crop, "cond", week);
    const progPrev = s.before(level, u.id, crop, "prog", week);
    const condPrev = s.before(level, u.id, crop, "cond", week);
    const w = this.data.nass.weeks.find((x) => x.week === week);

    const delta = (now: number | undefined, prev: number | undefined): string => {
      if (now === undefined || prev === undefined) return "";
      const d = now - prev;
      const sign = d > 0.0005 ? "+" : d < -0.0005 ? "−" : "±";
      return `<span class="stat-delta">${sign}${Math.abs(d).toFixed(2)} from prior week</span>`;
    };

    const agmet = this.data.agmet[crop]?.[level]?.[u.id];
    const agmetHtml = agmet
      ? `<button class="agmet-thumb" type="button" data-full="${esc(agmet.path)}">
           <img src="${import.meta.env.BASE_URL}agmet/${esc(agmet.path)}" alt="AgMet graphic for ${esc(u.name)}, ${CROP_NAMES[crop].toLowerCase()}" loading="lazy" width="2000" height="1000" />
           <span class="zoom-hint"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm1 2v3h3v2h-3v3H9v-3H6V9h3V6h2Z"/></svg>Enlarge</span>
         </button>`
      : `<div class="unavailable">No AgMet graphic is available for this ${level} and crop yet.</div>`;

    const crumb =
      level === "county"
        ? `County · <button class="link" data-goto-district>${esc(u.asdName)} district</button>`
        : "Agricultural statistics district";

    this.detail.innerHTML = `
      <div class="detail-head">
        <div>
          <p class="eyebrow">${crumb}</p>
          <h2>${esc(u.name)}</h2>
        </div>
        <div class="head-tools">
          ${this.pickerHtml()}
          <button class="icon-btn" data-clear aria-label="Clear selection" title="Clear selection">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>
          </button>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="stat-label">${CROP_NAMES[crop]} progress index</span>
          <span class="stat-value">${prog ? prog.value.toFixed(2) : "–"}</span>
          ${delta(prog?.value, progPrev?.value)}
          <div class="meter"><span style="width:${(prog?.value ?? 0) * 100}%"></span></div>
        </div>
        <div class="stat">
          <span class="stat-label">${CROP_NAMES[crop]} condition</span>
          <span class="stat-value">${cond ? cond.value.toFixed(2) : "–"}${
            cond
              ? `<span class="chip" style="--chip:${colorFor("cond", cond.value)}">${conditionLabel(cond.value)}</span>`
              : ""
          }</span>
          ${delta(cond?.value, condPrev?.value)}
          <div class="meter"><span style="width:${cond ? ((cond.value - 1) / 4) * 100 : 0}%;background:${cond ? colorFor("cond", cond.value) : "none"}"></span></div>
        </div>
      </div>
      <p class="stat-note">${w ? `Week ending ${fmtDate(w.week_ending)} (NASS week ${w.week})` : ""}${
        prog || cond ? "" : " · no NASS values reported for this week"
      }</p>

      <section class="card">
        <header class="card-head">
          <h3>AgMet graphic</h3>
          <span class="muted">${CROP_NAMES[crop]}${agmet ? ` · updated ${fmtDate(agmet.updated)}` : ""}</span>
        </header>
        ${agmetHtml}
      </section>

      <section class="card">
        <header class="card-head">
          <h3>Crop progress</h3>
          ${this.chartLegend(u)}
        </header>
        <div class="chart" data-chart="prog"></div>
        <p class="hint">Index from 0 (none planted) to 1 (all harvested). Shown as a running maximum; grey dots mark weekly values that dipped.</p>
      </section>

      <section class="card">
        <header class="card-head">
          <h3>Crop condition</h3>
          ${this.chartLegend(u)}
        </header>
        <div class="chart" data-chart="cond"></div>
        <p class="hint">Index from 1 (very poor) to 5 (excellent), weighted from the share of acres in each rating.</p>
      </section>`;

    this.bindPicker();
    this.detail.querySelector("[data-clear]")?.addEventListener("click", () => this.select(null));
    this.detail.querySelector("[data-goto-district]")?.addEventListener("click", () => {
      this.set({ level: "district", unit: u.asdCode });
    });
    this.detail.querySelector<HTMLButtonElement>(".agmet-thumb")?.addEventListener("click", (e) => {
      const path = (e.currentTarget as HTMLElement).dataset.full ?? "";
      this.openLightbox(path, `${u.name} · ${CROP_NAMES[crop]}`);
    });
    this.renderCharts(u);
  }

  private chartLegend(u: Unit): string {
    if (u.level !== "county") return "";
    return `<span class="series-key"><i class="k-main"></i>${esc(u.name.replace(" County", ""))}<i class="k-ref"></i>${esc(u.asdName)} district</span>`;
  }

  private bindPicker(): void {
    this.detail
      .querySelector<HTMLSelectElement>("[data-picker]")
      ?.addEventListener("change", (e) => {
        const id = (e.target as HTMLSelectElement).value;
        if (id) this.select(id);
      });
  }

  private renderCharts(u: Unit): void {
    const { crop, level, week } = this.state;
    const s = this.data.series;
    this.chartWidth = this.chartContainerWidth();
    const wk = this.data.nass.weeks.find((x) => x.week === week);
    for (const product of ["prog", "cond"] as const) {
      const el = this.detail.querySelector<HTMLElement>(`[data-chart="${product}"]`);
      if (!el) continue;
      const primary = s.get(level, u.id, crop, product);
      if (!primary.length) {
        el.innerHTML = `<div class="unavailable">No ${PRODUCT_NAMES[product].toLowerCase()} data reported yet this season.</div>`;
        continue;
      }
      el.replaceChildren(
        renderChart({
          product,
          year: this.data.nass.year,
          primary,
          primaryLabel: u.name,
          reference: level === "county" ? s.get("district", u.asdCode, crop, product) : null,
          referenceLabel: `${u.asdName} district`,
          selected: wk ? parseDate(wk.week_ending) : null,
          width: this.chartWidth,
        }),
      );
    }
  }

  // ---- header, lightbox, mobile peek bar

  private renderStatus(): void {
    const last = this.data.nass.weeks[this.data.nass.weeks.length - 1];
    const agmet = [this.agmetUpdated("corn"), this.agmetUpdated("soybeans")]
      .filter((d): d is string => d !== null)
      .sort()
      .pop();
    $("#status").innerHTML = `
      <span><i class="dot"></i>NASS data through week ${last?.week ?? "–"}${
        last ? ` (week ending ${fmtDate(last.week_ending)})` : ""
      }</span>
      <span><i class="dot alt"></i>AgMet graphics updated ${agmet ? fmtDate(agmet) : "–"}</span>`;
    $("#nass-docs").setAttribute("href", NASS_DOCS);
  }

  private bindLightbox(): void {
    const box = this.lightbox;
    const scroller = box.querySelector<HTMLElement>(".lb-scroll");
    box.querySelector("[data-close]")?.addEventListener("click", () => box.close());
    box
      .querySelector("[data-zoom]")
      ?.addEventListener("click", () => scroller?.classList.toggle("is-zoomed"));
    box
      .querySelector("img")
      ?.addEventListener("click", () => scroller?.classList.toggle("is-zoomed"));
    box.addEventListener("click", (e) => {
      if (e.target === box) box.close();
    });
    box.addEventListener("close", () => document.body.classList.remove("no-scroll"));
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
    const { crop, level, product, week } = this.state;
    const p = this.data.series.at(level, u.id, crop, product, week);
    const value = p
      ? `${PRODUCT_NAMES[product]} ${p.value.toFixed(2)}${product === "cond" ? ` · ${conditionLabel(p.value)}` : ""}`
      : "No data this week";
    this.peek.innerHTML = `<span class="peek-name">${esc(u.name)}</span><span class="peek-val">${value}</span><span class="peek-cta">Details<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 16.6 5.4 10 6.8 8.6l5.2 5.2 5.2-5.2 1.4 1.4L12 16.6Z"/></svg></span>`;
  }
}
