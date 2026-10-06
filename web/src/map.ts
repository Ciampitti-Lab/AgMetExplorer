import L from "leaflet";
import type { Feature, Geometry } from "geojson";
import type { AppData } from "./data";
import type { Level } from "./types";

export interface MapView {
  level: Level;
  selected: string | null;
  fill: (id: string) => string;
  tooltip: (id: string) => string;
}

const BASE_STYLE: L.PathOptions = { color: "#0a0a0a", weight: 0.8, fillOpacity: 0.92 };
const HOVER_STYLE: L.PathOptions = { color: "#eae6e5", weight: 2 };

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

  constructor(
    el: HTMLElement,
    private data: AppData,
    private onSelect: (id: string) => void,
  ) {
    const touch = L.Browser.mobile;
    this.map = L.map(el, {
      zoomControl: !touch,
      attributionControl: false,
      zoomSnap: 0.1,
      // one finger scrolls the page on phones, two fingers pan and zoom the map
      dragging: !touch,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    this.bounds = L.geoJSON(data.counties).getBounds();
    this.map.setMaxBounds(this.bounds.pad(0.6));
    this.fit();
    new ResizeObserver(() => {
      this.map.invalidateSize();
      this.fit();
    }).observe(el);
  }

  fit(): void {
    this.map.fitBounds(this.bounds, { padding: [10, 10] });
    this.map.setMinZoom(this.map.getZoom() - 0.5);
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
        style: { color: "#050505", weight: 8, opacity: 0.85, fill: false },
      }),
      L.geoJSON(feature, {
        interactive: false,
        style: { color: "#cfb991", weight: 3, fill: false },
      }),
    ]).addTo(this.map);
  }

  private raise(): void {
    this.outlines?.bringToFront();
    this.selection?.eachLayer((l) => (l as L.GeoJSON).bringToFront());
  }

  private styleFor(id: string): L.PathOptions {
    const v = this.view;
    const base = { ...BASE_STYLE, fillColor: v ? v.fill(id) : "#1d1d1d" };
    if (this.hovered === id && v?.selected !== id) return { ...base, ...HOVER_STYLE };
    return base;
  }

  private build(level: Level): void {
    this.units?.remove();
    this.outlines?.remove();
    this.drawSelection(null);
    this.paths.clear();
    this.level = level;

    const fc = level === "county" ? this.data.counties : this.data.districts;
    this.units = L.geoJSON(fc as GeoJSON.FeatureCollection, {
      style: () => BASE_STYLE,
      onEachFeature: (feature, layer) => {
        const id = unitId(level, feature as Feature<Geometry, Record<string, string>>);
        const path = layer as L.Path;
        this.paths.set(id, path);
        if (!L.Browser.mobile) {
          path.bindTooltip(() => this.view?.tooltip(id) ?? "", {
            sticky: true,
            direction: "top",
            offset: [0, -8],
            className: "unit-tip",
          });
        }
        path.on({
          mouseover: () => {
            this.hovered = id;
            path.setStyle(this.styleFor(id));
            path.bringToFront();
            this.raise();
          },
          mouseout: () => {
            this.hovered = null;
            path.setStyle(this.styleFor(id));
            this.raise();
          },
          click: () => this.onSelect(id),
        });
      },
    }).addTo(this.map);

    // district borders stay visible over the county map
    if (level === "county") {
      this.outlines = L.geoJSON(this.data.districts as GeoJSON.FeatureCollection, {
        interactive: false,
        style: { color: "#0a0a0a", weight: 2.4, fill: false, opacity: 0.9 },
      }).addTo(this.map);
    } else {
      this.outlines = null;
    }
  }
}
