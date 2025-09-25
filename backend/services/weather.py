import requests
from models.weather import Metar, Taf, Pirep
from models.notam import Notam

AVWX_BASE = "https://avwx.rest/api"
AVWX_TOKEN = "YOUR_AVWX_API_KEY"  # put in .env later

headers = {"Authorization": f"Bearer {AVWX_TOKEN}"}

def fetch_metar(icao: str) -> Metar:
    url = f"{AVWX_BASE}/metar/{icao}"
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return Metar(station=icao, raw_text="N/A")
    data = r.json()
    return Metar(
        station=icao,
        raw_text=data.get("raw", ""),
        temperature=data.get("temperature", {}).get("value"),
        wind=data.get("wind_direction", {}).get("repr"),
        visibility=data.get("visibility", {}).get("repr"),
        conditions=", ".join([wx["value"] for wx in data.get("wx_codes", [])]) if data.get("wx_codes") else None
    )

def fetch_taf(icao: str) -> Taf:
    url = f"{AVWX_BASE}/taf/{icao}"
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return Taf(station=icao, raw_text="N/A")
    data = r.json()
    return Taf(
        station=icao,
        raw_text=data.get("raw", ""),
        forecast=data.get("forecast", {}).get("summary")
    )

def fetch_notams(icao: str) -> list[Notam]:
    url = f"{AVWX_BASE}/notam/{icao}"
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return []
    data = r.json()
    return [
        Notam(
            id=item.get("id", "N/A"),
            airport=icao,
            text=item.get("raw", ""),
            critical="RWY" in item.get("raw", "") or "TFR" in item.get("raw", "")
        )
        for item in data
    ]

def fetch_pireps(airports: list[str]) -> list[Pirep]:
    """
    Simplified: fetch PIREPs around airports by ICAO
    (you can expand later with bounding boxes).
    """
    pireps: list[Pirep] = []
    for icao in airports:
        url = f"{AVWX_BASE}/pirep/{icao}"
        r = requests.get(url, headers=headers)
        if r.status_code != 200:
            continue
        data = r.json()
        pireps.append(
            Pirep(
                report=data.get("raw", "N/A"),
                altitude=data.get("altitude", {}).get("value"),
                location=icao
            )
        )
    return pireps
