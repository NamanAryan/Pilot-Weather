from models.airport import Airport
from typing import List, Dict, Optional
import os
import csv
import math
from functools import lru_cache

DATA_FILE_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "airports.csv"))


def _to_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in nautical miles."""
    R_km = 6371.0088
    KM_TO_NM = 0.539956803
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R_km * c * KM_TO_NM


@lru_cache(maxsize=1)
def _load_airports() -> List[Dict[str, str]]:
    """Load airports CSV into memory as a list of dict rows.

    This is designed to be resilient to column naming differences across datasets
    like OurAirports. We keep raw strings to avoid unintended coercions.
    """
    rows: List[Dict[str, str]] = []
    if not os.path.exists(DATA_FILE_PATH):
        return rows

    with open(DATA_FILE_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _extract_icao(row: Dict[str, str]) -> Optional[str]:
    for key in ("ident", "icao", "gps_code", "icao_code"):
        code = row.get(key)
        if code and len(code) in (3, 4):
            # Prefer 4-letter ICAO
            if len(code) == 4:
                return code.upper()
            # Some datasets put ICAO in gps_code; accept if no better found later
            return code.upper()
    return None


def _extract_name(row: Dict[str, str]) -> Optional[str]:
    for key in ("name", "airport_name", "display_name"):
        name = row.get(key)
        if name:
            return name
    return None


def _extract_coords(row: Dict[str, str]) -> Optional[tuple]:
    lat = None
    lon = None
    for key in ("latitude_deg", "lat", "latitude", "latitude_decimal"):
        lat = _to_float(row.get(key)) if lat is None else lat
    for key in ("longitude_deg", "lon", "longitude", "longitude_decimal"):
        lon = _to_float(row.get(key)) if lon is None else lon
    if lat is None or lon is None:
        return None
    return (lat, lon)


def _extract_type(row: Dict[str, str]) -> Optional[str]:
    return row.get("type") or row.get("airport_type")


def _extract_runway_length_m(row: Dict[str, str]) -> Optional[int]:
    """Try multiple common fields for longest runway length in meters or feet.
    Falls back to None if unknown.
    """
    # Meters fields
    for key in ("longest_runway_m", "longest_runway_length_mt", "runway_length_m", "longest_runway_length_m"):
        v = row.get(key)
        val = _to_float(v) if v is not None else None
        if val is not None and val > 0:
            return int(round(val))

    # Feet fields -> convert to meters
    for key in ("longest_runway_ft", "runway_length_ft", "longest_runway_length_ft"):
        v = row.get(key)
        val = _to_float(v) if v is not None else None
        if val is not None and val > 0:
            meters = val * 0.3048
            return int(round(meters))

    return None


def get_airport_info(icao: str) -> Optional[Dict[str, Optional[object]]]:
    """Return a basic info dict for an airport by ICAO from the CSV."""
    icao_u = (icao or "").upper()
    for row in _load_airports():
        code = _extract_icao(row)
        if code == icao_u:
            coords = _extract_coords(row)
            return {
                "icao": code,
                "name": _extract_name(row),
                "type": _extract_type(row),
                "latitude_deg": coords[0] if coords else None,
                "longitude_deg": coords[1] if coords else None,
                "runway_length_m": _extract_runway_length_m(row),
                "country": row.get("iso_country") or row.get("country"),
                "municipality": row.get("municipality") or row.get("city"),
            }
    return None


def _is_suitable_alternate(row: Dict[str, str], min_runway_m: Optional[int]) -> bool:
    airport_type = (_extract_type(row) or "").lower()
    if airport_type and airport_type not in ("large_airport", "medium_airport", "small_airport"):
        # Exclude heliports, seaplane bases, closed, etc.
        return False

    if min_runway_m is None:
        return True

    length_m = _extract_runway_length_m(row)
    if length_m is None:
        # Unknown; be permissive but lower rank later
        return True

    return length_m >= min_runway_m


def get_alternate_airports(dest_icao: str, max_results: int = 5, radius_nm: float = 200.0, min_runway_m: Optional[int] = 2200) -> List[Airport]:
    """Find nearby alternate airports using the local CSV dataset.

    - radius_nm: search radius in nautical miles
    - min_runway_m: minimum longest runway length in meters (None to ignore)
    """
    if not dest_icao:
        return []

    dest_info = get_airport_info(dest_icao)
    if not dest_info or dest_info.get("latitude_deg") is None or dest_info.get("longitude_deg") is None:
        return []

    dest_lat = float(dest_info["latitude_deg"])  # type: ignore[arg-type]
    dest_lon = float(dest_info["longitude_deg"])  # type: ignore[arg-type]

    candidates: List[tuple] = []  # (score tuple, Airport)

    for row in _load_airports():
        code = _extract_icao(row)
        if not code or code == dest_icao.upper():
            continue

        coords = _extract_coords(row)
        if not coords:
            continue

        distance_nm = _haversine_nm(dest_lat, dest_lon, coords[0], coords[1])
        if distance_nm > radius_nm:
            continue

        if not _is_suitable_alternate(row, min_runway_m):
            continue

        runway_m = _extract_runway_length_m(row)
        airport_obj = Airport(
            icao=code,
            name=_extract_name(row),
            lat=coords[0],
            lon=coords[1],
            runway_length=int(runway_m) if runway_m is not None else None,
            has_fuel=None,
            has_customs=None,
        )

        # Rank preference:
        # 1) Airport type (large < medium < small)
        # 2) Known runway length (known > unknown)
        # 3) Longer runway first
        # 4) Closer distance
        type_str = (_extract_type(row) or "").lower()
        type_rank = {"large_airport": 0, "medium_airport": 1, "small_airport": 2}.get(type_str, 3)
        known_flag = 0 if runway_m is None else 1
        runway_desc = -(runway_m or 0)
        score = (type_rank, -known_flag, runway_desc, distance_nm)
        candidates.append((score, airport_obj))

    candidates.sort(key=lambda x: x[0])
    return [a for _, a in candidates[:max_results]]


def get_alternate_airports_categorized(
    dest_icao: str,
    max_results: int = 5,
    radius_nm: float = 200.0,
    min_runway_m: Optional[int] = 2200,
) -> Dict[str, List[Airport]]:
    if not dest_icao:
        return {"least_deviation": [], "best_fuel_efficiency": [], "safest": []}

    dest_info = get_airport_info(dest_icao)
    if not dest_info or dest_info.get("latitude_deg") is None or dest_info.get("longitude_deg") is None:
        return {"least_deviation": [], "best_fuel_efficiency": [], "safest": []}

    dest_lat = float(dest_info["latitude_deg"])  # type: ignore[arg-type]
    dest_lon = float(dest_info["longitude_deg"])  # type: ignore[arg-type]

    pool: List[Dict[str, object]] = []

    for row in _load_airports():
        code = _extract_icao(row)
        if not code or code == dest_icao.upper():
            continue

        coords = _extract_coords(row)
        if not coords:
            continue

        distance_nm = _haversine_nm(dest_lat, dest_lon, coords[0], coords[1])
        if distance_nm > radius_nm:
            continue

        if not _is_suitable_alternate(row, min_runway_m):
            continue

        runway_m = _extract_runway_length_m(row)
        type_str = (_extract_type(row) or "").lower()
        type_rank = {"large_airport": 0, "medium_airport": 1, "small_airport": 2}.get(type_str, 3)

        airport_obj = Airport(
            icao=code,
            name=_extract_name(row),
            lat=coords[0],
            lon=coords[1],
            runway_length=int(runway_m) if runway_m is not None else None,
            has_fuel=None,
            has_customs=None,
        )

        pool.append({
            "airport": airport_obj,
            "distance_nm": distance_nm,
            "runway_m": runway_m or 0,
            "type_rank": type_rank,
        })

    least_deviation = [p["airport"] for p in sorted(pool, key=lambda p: p["distance_nm"])[:max_results]]  # type: ignore[index]
    best_fuel_efficiency = [
        p["airport"]
        for p in sorted(pool, key=lambda p: (p["distance_nm"], -p["runway_m"]))[:max_results]  # type: ignore[index]
    ]
    safest = [
        p["airport"]
        for p in sorted(pool, key=lambda p: (-p["runway_m"], p["type_rank"], p["distance_nm"]))[:max_results]  # type: ignore[index]
    ]

    return {
        "least_deviation": least_deviation,
        "best_fuel_efficiency": best_fuel_efficiency,
        "safest": safest,
    }


def get_top3_alternate_airports_by_category(
    dest_icao: str,
    radius_nm: float = 200.0,
    min_runway_m: Optional[int] = 2200,
) -> Dict[str, Optional[Airport]]:
    lists = get_alternate_airports_categorized(
        dest_icao=dest_icao,
        max_results=10,
        radius_nm=radius_nm,
        min_runway_m=min_runway_m,
    )

    chosen: Dict[str, Optional[Airport]] = {
        "safest": None,
        "least_deviation": None,
        "best_fuel_efficiency": None,
    }

    used: set[str] = set()

    def pick_first_unique(items: List[Airport]) -> Optional[Airport]:
        for a in items:
            if a.icao not in used:
                used.add(a.icao)
                return a
        return None

    chosen["safest"] = pick_first_unique(lists.get("safest", []))
    chosen["least_deviation"] = pick_first_unique(lists.get("least_deviation", []))
    chosen["best_fuel_efficiency"] = pick_first_unique(lists.get("best_fuel_efficiency", []))

    return chosen