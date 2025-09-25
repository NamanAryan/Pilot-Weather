import requests
import os

BASE_AVWX = "https://avwx.rest/api"

AVWX_TOKEN = os.getenv("AVWX_TOKEN")

headers = {"Authorization": f"BEARER {AVWX_TOKEN}"}

def fetch_metar(icao: str) -> dict:
    url = f"{BASE_AVWX}/metar/{icao}"
    res = requests.get(url, headers=headers)
    return res.json() if res.ok else {}

def fetch_taf(icao: str) -> dict:
    url = f"{BASE_AVWX}/taf/{icao}"
    res = requests.get(url, headers=headers)
    return res.json() if res.ok else {}

def fetch_notams(icao: str) -> list:
    url = f"{BASE_AVWX}/notam/{icao}"
    res = requests.get(url, headers=headers)
    return res.json() if res.ok else []

def fetch_pireps(lat: float, lon: float) -> list:
    """
    Fetch PIREPs within ~2 degree box
    """
    bbox = f"{lat-2},{lon-2},{lat+2},{lon+2}"
    url = f"{BASE_AVWX}/pirep?bbox={bbox}"
    res = requests.get(url, headers=headers)
    return res.json() if res.ok else []
