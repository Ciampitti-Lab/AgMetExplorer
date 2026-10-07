import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { AppData } from "./data";
import { palette } from "./theme";
import type { Level } from "./types";

export interface MapView {
  level: Level;
  selected: string | null;
  fill: (id: string) => string;
  tooltip: (id: string) => string;
}

function unitId(level: Level, f: Feature<Geometry, Record<string, string>>): string {
  return (level === "county" ? f.properties.GEOID : f.properties.ASD_CODE) ?? "";
}

export class UnitMap {
  private map: L.Map;
  private units: L.GeoJSON | null = null;
  private outlines: L.GeoJSON | null = null;
  private selection: L.LayerGroup | null = null;
  private selectedId: string | null = null;
  private paths = new Map<string, L.Path>();
  private level: Level | null = null;
  private view: MapView | null = null;
  private hovered: string | null = null;
  private bounds: L.LatLngBounds;
  // one shared tooltip: per-county tooltips piled up on touch screens and while scrolling
  private tip = L.tooltip({ direction: "right", offset: [14, 0], className: "unit-tip" });
  private hoverable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  constructor(
    el: HTMLElement,
    private data: AppData,
    private onSelect: (id: string) => void,
  ) {
    // fixed view of Indiana: no zoom or pan, so the map never fights page scrolling
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.05,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    this.bounds = L.geoJSON(data.counties).getBounds();
    this.fit();
    new ResizeObserver(() => {
      this.map.invalidateSize();
      this.fit();
    }).observe(el);
    el.addEventListener("mouseleave", () => this.unhover());
    window.addEventListener("scroll", () => this.unhover(), { passive: true });
  }

  private hover(id: string, path: L.Path, at: L.LatLng): void {
    if (!this.hoverable) return;
    if (this.hovered && this.hovered !== id) this.unhover();
    this.hovered = id;
    path.setStyle(this.styleFor(id));
    path.bringToFront();
    this.raise();
    this.tip.setContent(this.view?.tooltip(id) ?? "").setLatLng(at);
    if (!this.map.hasLayer(this.tip)) this.tip.addTo(this.map);
  }

  private unhover(): void {
    const prev = this.hovered;
    this.hovered = null;
    if (prev) this.paths.get(prev)?.setStyle(this.styleFor(prev));
    this.tip.remove();
    this.raise();
  }

  fit(): void {
    this.map.fitBounds(this.bounds, { padding: [12, 12], animate: false });
  }

  render(view: MapView): void {
    this.view = view;
    if (view.level !== this.level) this.build(view.level);
    for (const [id, path] of this.paths) path.setStyle(this.styleFor(id));
    if (view.selected !== this.selectedId) this.drawSelection(view.selected);
    this.raise();
  }

  // a dark halo under a gold line keeps the selection visible on any fill color
  private drawSelection(id: string | null): void {
    this.selection?.remove();
    this.selection = null;
    this.selectedId = id;
    const level = this.level;
    if (!id || !level) return;
    const fc = (
      level === "county" ? this.data.counties : this.data.districts
    ) as GeoJSON.FeatureCollection;
    const feature = fc.features.find(
      (f) => unitId(level, f as Feature<Geometry, Record<string, string>>) === id,
    );
    if (!feature) return;
    this.selection = L.layerGroup([
      L.geoJSON(feature, {
        interactive: false,
        style: { color: palette().halo, weight: 8, opacity: 0.85, fill: false },
      }),
      L.geoJSON(feature, {
        interactive: false,
        style: { color: palette().select, weight: 3, fill: false },
      }),
    ]).addTo(this.map);
  }

  private outlineStyle(): L.PathOptions {
    return { color: palette().outline, weight: 2.4, fill: false, opacity: 0.9 };
  }

  /** Re-apply stroke colors after the theme changes. */
  restyle(): void {
    this.outlines?.setStyle(this.outlineStyle());
    const id = this.selectedId;
    this.drawSelection(null);
    this.drawSelection(id);
    if (this.view) this.render(this.view);
  }

  private raise(): void {
    this.outlines?.bringToFront();
    this.selection?.eachLayer((l) => (l as L.GeoJSON).bringToFront());
  }

  private styleFor(id: string): L.PathOptions {
    const v = this.view;
    const c = palette();
    const base = {
      color: c.border,
      weight: 0.8,
      fillOpacity: 0.92,
      fillColor: v ? v.fill(id) : c.noFill,
    };
    if (this.hovered === id && v?.selected !== id) return { ...base, color: c.hover, weight: 2 };
    return base;
  }

  private build(level: Level): void {
    this.unhover();
    this.units?.remove();
    this.outlines?.remove();
    this.drawSelection(null);
    this.paths.clear();
    this.level = level;

    const fc = level === "county" ? this.data.counties : this.data.districts;
    this.units = L.geoJSON(fc as GeoJSON.FeatureCollection, {
      style: () => ({ color: palette().border, weight: 0.8, fillOpacity: 0.92 }),
      onEachFeature: (feature, layer) => {
        const id = unitId(level, feature as Feature<Geometry, Record<string, string>>);
        const path = layer as L.Path;
        this.paths.set(id, path);
        path.on({
          mouseover: (e: L.LeafletMouseEvent) => this.hover(id, path, e.latlng),
          // tooltip sits to the right of the cursor so it is not clipped above northern counties
          mousemove: (e: L.LeafletMouseEvent) => {
            if (this.hovered === id) this.tip.setLatLng(e.latlng);
          },
          mouseout: () => this.unhover(),
          click: () => {
            this.unhover();
            this.onSelect(id);
          },
        });
      },
    }).addTo(this.map);

    // district borders stay visible over the county map
    if (level === "county") {
      this.outlines = L.geoJSON(this.data.districts as GeoJSON.FeatureCollection, {
        interactive: false,
        style: () => this.outlineStyle(),
      }).addTo(this.map);
    } else {
      this.outlines = null;
    }
  }
}
