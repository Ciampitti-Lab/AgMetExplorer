"""Indiana county and ag district boundaries from Census 1:500k and the NASS county list."""

import argparse
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

STATE_FIPS = "18"
EXPECTED_COUNTIES = 92
EXPECTED_DISTRICTS = 9


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def parse_nass_county_list(path: Path, state_fips: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    # county 888 = combined counties, 999 = district name row, districts 98/99 = totals
    counties, districts = [], []
    pattern = re.compile(r"^(\d{2})\s+(\d{2})\s+(\d{3})\s+(.+?)\s+(\d)\s*$")
    for line in path.read_text(encoding="latin-1").splitlines():
        m = pattern.match(line)
        if not m or m.group(1) != state_fips or m.group(5) != "1":
            continue
        _, dist, county, name, _ = m.groups()
        if not 10 <= int(dist) <= 90:
            continue
        asd_code = f"{state_fips}{dist}"
        if county == "999":
            districts.append({"ASD_CODE": asd_code, "ASD_NAME": re.sub(r"^D\d{2}\s+", "", name)})
        elif county != "888":
            counties.append({"GEOID": f"{state_fips}{county}", "ASD_CODE": asd_code})
    return pd.DataFrame(counties), pd.DataFrame(districts)


def build(census_zip: Path, county_list: Path, out: Path) -> None:
    nass_counties, nass_districts = parse_nass_county_list(county_list, STATE_FIPS)
    if len(nass_counties) != EXPECTED_COUNTIES or len(nass_districts) != EXPECTED_DISTRICTS:
        raise SystemExit(
            f"NASS list: {len(nass_counties)} counties, {len(nass_districts)} districts"
        )

    gdf = gpd.read_file(f"zip://{census_zip}")
    gdf = gdf[gdf["STATEFP"] == STATE_FIPS][["GEOID", "NAME", "geometry"]].to_crs("EPSG:4326")
    gdf = gdf.merge(nass_counties, on="GEOID", how="left", validate="1:1")
    missing = gdf[gdf["ASD_CODE"].isna()]["GEOID"].tolist()
    if missing or len(gdf) != EXPECTED_COUNTIES:
        raise SystemExit(f"Census/NASS mismatch: {len(gdf)} counties, unmatched {missing}")
    gdf = gdf.merge(nass_districts, on="ASD_CODE", how="left", validate="m:1")
    gdf["SLUG"] = gdf["NAME"].map(slugify)
    gdf = gdf.sort_values("GEOID").reset_index(drop=True)

    districts = (
        gdf.dissolve(by=["ASD_CODE", "ASD_NAME"], as_index=False)[
            ["ASD_CODE", "ASD_NAME", "geometry"]
        ]
        .sort_values("ASD_CODE")
        .reset_index(drop=True)
    )
    districts["SLUG"] = districts["ASD_NAME"].map(slugify)

    out.mkdir(parents=True, exist_ok=True)
    gdf[["GEOID", "NAME", "ASD_CODE", "ASD_NAME", "SLUG", "geometry"]].to_file(
        out / "indiana_counties.geojson", driver="GeoJSON"
    )
    districts[["ASD_CODE", "ASD_NAME", "SLUG", "geometry"]].to_file(
        out / "indiana_districts.geojson", driver="GeoJSON"
    )
    units = pd.concat(
        [
            pd.DataFrame(
                {
                    "level": "county",
                    "id": gdf["GEOID"],
                    "name": gdf["NAME"],
                    "slug": gdf["SLUG"],
                    "asd_code": gdf["ASD_CODE"],
                }
            ),
            pd.DataFrame(
                {
                    "level": "district",
                    "id": districts["ASD_CODE"],
                    "name": districts["ASD_NAME"],
                    "slug": districts["SLUG"],
                    "asd_code": districts["ASD_CODE"],
                }
            ),
        ]
    )
    units.to_csv(out / "units.csv", index=False)
    print(f"wrote {len(gdf)} counties, {len(districts)} districts to {out}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--census-zip", type=Path, required=True)
    p.add_argument("--county-list", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    build(a.census_zip, a.county_list, a.out)


if __name__ == "__main__":
    main()
