"""Zonal means of NASS crop progress and condition layers per Indiana county and ag district."""

import argparse
import json
from collections import defaultdict
from datetime import UTC, date, datetime
from pathlib import Path

import geopandas as gpd
import rasterio
from exactextract import exact_extract

from nass_fetch import TIF_RE

BOUNDARIES = Path(__file__).parent / "boundaries"
CROP_KEYS = {"corn": "corn", "soy": "soybeans"}
PRODUCT_KEYS = {"prog": "prog", "cond": "cond"}
LEVELS = {"county": "GEOID", "district": "ASD_CODE"}
MIN_COVERAGE = 0.5


def week_ending(year: int, week: int) -> date:
    # NASS weeks look like ISO weeks ending Sunday (2026 w40 = 2026-10-04)
    return date.fromisocalendar(year, week, 7)


def parse_layers(root: Path) -> list[dict]:
    layers = []
    for path in sorted(root.rglob("*")):
        m = TIF_RE.match(path.name)
        if not m or m["crop"].lower() not in CROP_KEYS:
            continue
        layers.append(
            {
                "path": path,
                "crop": CROP_KEYS[m["crop"].lower()],
                "product": PRODUCT_KEYS[m["product"].lower()],
                "year": 2000 + int(m["yy"]),
                "week": int(m["ww"]),
            }
        )
    return layers


def zonal_means(
    tif: Path, units: gpd.GeoDataFrame, id_col: str, min_coverage: float = MIN_COVERAGE
) -> dict[str, float]:
    with rasterio.open(tif) as src:
        zones = units.to_crs(src.crs)
        zones["area"] = zones.area
        cell_area = abs(src.res[0] * src.res[1])
        df = exact_extract(
            src, zones, ["mean", "count"], include_cols=[id_col, "area"], output="pandas"
        )
    # when Indiana is masked, border units still catch a few pixels from neighboring states
    df = df[df["count"] * cell_area / df["area"] >= min_coverage]
    return {str(r[id_col]): round(float(r["mean"]), 3) for _, r in df.iterrows()}


def build(layers: list[dict], boundaries: Path) -> dict:
    years = {layer["year"] for layer in layers}
    if len(years) != 1:
        raise SystemExit(f"expected one year of layers, found {sorted(years)}")
    year = years.pop()

    units = {
        "county": gpd.read_file(boundaries / "indiana_counties.geojson"),
        "district": gpd.read_file(boundaries / "indiana_districts.geojson"),
    }
    out: dict[str, dict] = {lvl: defaultdict(dict) for lvl in LEVELS}
    for lvl, gdf in units.items():
        for uid in gdf[LEVELS[lvl]]:
            out[lvl][str(uid)] = {c: {"prog": {}, "cond": {}} for c in CROP_KEYS.values()}

    weeks: set[int] = set()
    for layer in layers:
        for lvl, gdf in units.items():
            means = zonal_means(layer["path"], gdf, LEVELS[lvl])
            for uid, value in means.items():
                out[lvl][uid][layer["crop"]][layer["product"]][str(layer["week"])] = value
            if means:
                weeks.add(layer["week"])

    return {
        "year": year,
        "generated": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "weeks": [
            {"week": w, "week_ending": week_ending(year, w).isoformat()} for w in sorted(weeks)
        ],
        "county": dict(out["county"]),
        "district": dict(out["district"]),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="inp", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--boundaries", type=Path, default=BOUNDARIES)
    a = p.parse_args()

    layers = parse_layers(a.inp)
    if not layers:
        raise SystemExit(f"no corn or soybean layers found in {a.inp}")
    result = build(layers, a.boundaries)
    a.out.mkdir(parents=True, exist_ok=True)
    path = a.out / f"nass_{result['year']}.json"
    path.write_text(json.dumps(result, separators=(",", ":")))
    print(f"wrote {path} ({len(result['weeks'])} weeks, {len(layers)} layers)")


if __name__ == "__main__":
    main()
