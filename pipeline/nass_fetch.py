"""Download the NASS Crop Progress gridded layers zip for a year and extract the GeoTIFFs."""

import argparse
import io
import re
import time
import zipfile
from pathlib import Path

import requests

URL = (
    "https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/"
    "datasets/cpc{year}.zip"
)
TIF_RE = re.compile(
    r"^(?P<crop>[a-z]+)(?P<product>prog|cond)(?P<yy>\d{2})w(?P<ww>\d{2})\.tif$", re.I
)
DEFAULT_CROPS = ("corn", "soy")


# nass.usda.gov rejects some non-browser clients from cloud runners
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/140.0 Safari/537.36"
    ),
    "Accept": "application/zip,application/octet-stream,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nass.usda.gov/Research_and_Science/Crop_Progress_Gridded_Layers/",
}


def download(url: str, attempts: int = 4, timeout: int = 300) -> bytes:
    for i in range(attempts):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            return r.content
        except requests.HTTPError as e:
            # a 4xx will not fix itself on retry
            if e.response is not None and e.response.status_code < 500:
                raise
            if i == attempts - 1:
                raise
        except requests.RequestException:
            if i == attempts - 1:
                raise
        time.sleep(30 * (i + 1))
    raise AssertionError("unreachable")


def iter_tifs(zf: zipfile.ZipFile):
    """Yield (name, bytes) for every layer .tif, descending into the per-crop zips."""
    for info in zf.infolist():
        name = Path(info.filename).name
        if name.lower().endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(zf.read(info))) as inner:
                yield from iter_tifs(inner)
        elif TIF_RE.match(name):
            yield name, zf.read(info)


def extract(data: bytes, out: Path, crops: tuple[str, ...]) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name, payload in iter_tifs(zf):
            if TIF_RE.match(name)["crop"].lower() not in crops:
                continue
            path = out / name
            path.write_bytes(payload)
            written.append(path)
    return written


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--crops", nargs="+", default=list(DEFAULT_CROPS))
    p.add_argument("--zip", type=Path, help="use a local zip instead of downloading")
    a = p.parse_args()

    data = a.zip.read_bytes() if a.zip else download(URL.format(year=a.year))
    written = extract(data, a.out, tuple(c.lower() for c in a.crops))
    if not written:
        raise SystemExit("no parseable .tif layers in the NASS zip, naming may have changed")
    print(f"extracted {len(written)} layers to {a.out}")


if __name__ == "__main__":
    main()
