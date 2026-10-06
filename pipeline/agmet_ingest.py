"""Rename AgMet graphics to FIPS / ASD codes, resize them and write a manifest."""

import argparse
import csv
import json
import re
import shutil
from pathlib import Path

from PIL import Image

UNITS = Path(__file__).parent / "boundaries" / "units.csv"
SRC_RE = re.compile(
    r"(?P<crop>[a-z]+)_s(?P<season>\d+)_(?P<year>\d{4})/condition/"
    r"(?P<level>adm2|district)/(?P<state>[a-z_]+?)_(?P<slug>[a-z0-9_]+)\.png$"
)
CROPS = {"mz": "corn", "sb": "soybeans"}
LEVELS = {"adm2": "county", "district": "district"}
STATE = "indiana"


def is_junk(path: Path) -> bool:
    return path.name.startswith("._") or path.name == ".DS_Store" or "__MACOSX" in path.parts


def load_units(path: Path) -> dict[tuple[str, str], str]:
    with path.open() as f:
        return {(r["level"], r["slug"]): r["id"] for r in csv.DictReader(f)}


def find_sources(root: Path, units: dict[tuple[str, str], str]) -> list[dict]:
    sources, unmatched = [], []
    for path in sorted(root.rglob("*.png")):
        if is_junk(path):
            continue
        m = SRC_RE.search(path.as_posix())
        if not m or m["state"] != STATE or m["crop"] not in CROPS:
            unmatched.append(path)
            continue
        level = LEVELS[m["level"]]
        uid = units.get((level, m["slug"]))
        if uid is None:
            unmatched.append(path)
            continue
        sources.append({"path": path, "crop": CROPS[m["crop"]], "level": level, "id": uid})
    if unmatched:
        names = "\n  ".join(str(p) for p in unmatched)
        raise SystemExit(f"{len(unmatched)} AgMet files did not match a known unit:\n  {names}")
    return sources


def convert(src: Path, dst: Path, width: int, fmt: str, quality: int) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "png" and not width:
        shutil.copy2(src, dst)
        return
    with Image.open(src) as im:
        im = im.convert("RGB")
        if width and im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if fmt == "webp":
            im.save(dst, "WEBP", quality=quality, method=6)
        else:
            im.save(dst, "PNG")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="inp", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True, help="writes {out}/{crop}/{level}/{id}.ext")
    p.add_argument("--date", required=True, help="delivery date, YYYY-MM-DD")
    p.add_argument("--units", type=Path, default=UNITS)
    p.add_argument("--width", type=int, default=2000, help="0 keeps the original size")
    p.add_argument("--format", choices=["webp", "png"], default="webp")
    p.add_argument("--quality", type=int, default=85)
    a = p.parse_args()

    sources = find_sources(a.inp, load_units(a.units))
    if not sources:
        raise SystemExit(f"no AgMet graphics found in {a.inp}")

    manifest_path = a.out / "manifest.json"
    manifest: dict = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for s in sources:
        rel = Path(s["crop"]) / s["level"] / f"{s['id']}.{a.format}"
        convert(s["path"], a.out / rel, a.width, a.format, a.quality)
        entry = {"path": rel.as_posix(), "updated": a.date}
        manifest.setdefault(s["crop"], {}).setdefault(s["level"], {})[s["id"]] = entry

    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))
    print(f"wrote {len(sources)} graphics and {manifest_path}")


if __name__ == "__main__":
    main()
