from datetime import date
from pathlib import Path

import pytest

from agmet_ingest import SRC_RE, is_junk
from nass_fetch import TIF_RE
from nass_zonal import week_ending


@pytest.mark.parametrize(
    "name,crop,product,week",
    [
        ("cornProg26w40.tif", "corn", "Prog", "40"),
        ("CORNCOND26w21.tif", "CORN", "COND", "21"),
        ("soyCond26w18.tif", "soy", "Cond", "18"),
    ],
)
def test_tif_names(name, crop, product, week):
    m = TIF_RE.match(name)
    assert m and (m["crop"], m["product"], m["ww"]) == (crop, product, week)


@pytest.mark.parametrize("name", ["cornProg26w40.tfw", "cornProg26w40.tif.aux.xml", "corn.tif"])
def test_tif_names_rejected(name):
    assert TIF_RE.match(name) is None


def test_week_ending_is_sunday():
    assert week_ending(2026, 40) == date(2026, 10, 4)
    assert week_ending(2026, 15) == date(2026, 4, 12)


def test_agmet_names():
    m = SRC_RE.search("x/mz_s1_2026/condition/adm2/indiana_st_joseph.png")
    assert (m["crop"], m["level"], m["state"], m["slug"]) == ("mz", "adm2", "indiana", "st_joseph")
    m = SRC_RE.search("x/sb_s1_2026/condition/district/indiana_east_central.png")
    assert (m["crop"], m["level"], m["slug"]) == ("sb", "district", "east_central")


def test_junk():
    assert is_junk(Path("a/._indiana_adams.png"))
    assert is_junk(Path("__MACOSX/a/indiana_adams.png"))
    assert not is_junk(Path("a/indiana_adams.png"))
