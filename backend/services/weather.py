import requests
import os
from dotenv import load_dotenv
from models.weather import Metar, Taf, Pirep
from models.notam import Notam

load_dotenv()

AVWX_BASE = "https://avwx.rest/api"
AVWX_TOKEN = os.getenv("AVWX_TOKEN")

print(f"🔑 AVWX_TOKEN: {AVWX_TOKEN}")

headers = {"Authorization": f"Bearer {AVWX_TOKEN}"} if AVWX_TOKEN else {}

def fetch_metar(icao: str) -> Metar:
    if not AVWX_TOKEN:
        raise Exception(f"AVWX_TOKEN not configured - cannot fetch real weather data for {icao}")
    
    url = f"{AVWX_BASE}/metar/{icao}"
    print(f"🌐 Fetching METAR: {url}")
    r = requests.get(url, headers=headers, timeout=10)
    
    print(f"📊 METAR Response Status: {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ METAR API Error: {r.text}")
        raise Exception(f"AVWX API error {r.status_code}: {r.text}")
    
    data = r.json()
    print(f"📄 METAR Data Type: {type(data)}")
    print(f"📄 METAR Data: {data}")
    
    # Handle both dict and list responses
    if isinstance(data, list):
        data = data[0] if data else {}
    
    return Metar(
        station=icao,
        raw_text=data.get("raw", "") if isinstance(data, dict) else str(data),
        temperature=data.get("temperature", {}).get("value") if isinstance(data, dict) else None,
        wind=data.get("wind_direction", {}).get("repr") if isinstance(data, dict) else None,
        visibility=data.get("visibility", {}).get("repr") if isinstance(data, dict) else None,
        conditions=", ".join([wx["value"] for wx in data.get("wx_codes", [])]) if isinstance(data, dict) and data.get("wx_codes") else None
    )

def fetch_taf(icao: str) -> Taf:
    if not AVWX_TOKEN:
        raise Exception(f"AVWX_TOKEN not configured - cannot fetch TAF for {icao}")
    
    url = f"{AVWX_BASE}/taf/{icao}"
    print(f"🌐 Fetching TAF: {url}")
    r = requests.get(url, headers=headers, timeout=10)
    
    print(f"📊 TAF Response Status: {r.status_code}")
    
    if r.status_code != 200:
        print(f"❌ TAF API Error: {r.text}")
        raise Exception(f"AVWX API error {r.status_code}: {r.text}")
    
    data = r.json()
    print(f"📄 TAF Data Type: {type(data)}")
    print(f"📄 TAF Data: {data}")
    
    # Handle both dict and list responses
    if isinstance(data, list):
        data = data[0] if data else {}
    
    # Safe extraction for TAF data
    raw_text = ""
    forecast = ""
    
    if isinstance(data, dict):
        raw_text = data.get("raw", "")
        # Try different forecast field names
        forecast_data = data.get("forecast", {})
        if isinstance(forecast_data, dict):
            forecast = forecast_data.get("summary", "")
        elif isinstance(forecast_data, str):
            forecast = forecast_data
    else:
        raw_text = str(data)
        forecast = ""
    
    return Taf(
        station=icao,
        raw_text=raw_text,
        forecast=forecast
    )

def fetch_notams(icao: str) -> list[Notam]:
    if not AVWX_TOKEN:
        return []  # NOTAMs are optional
    
    try:
        url = f"{AVWX_BASE}/notam/{icao}"
        print(f"🌐 Fetching NOTAMs: {url}")
        r = requests.get(url, headers=headers, timeout=10)
        
        print(f"📊 NOTAM Response Status: {r.status_code}")
        
        if r.status_code != 200:
            print(f"❌ NOTAM API Error: {r.text}")
            return []
        
        data = r.json()
        print(f"📄 NOTAM Data Type: {type(data)}")
        
        # Handle different response formats
        if not isinstance(data, list):
            data = [data] if data else []
        
        return [
            Notam(
                id=item.get("id", "N/A") if isinstance(item, dict) else "N/A",
                airport=icao,
                text=item.get("raw", str(item)) if isinstance(item, dict) else str(item),
                critical=("RWY" in str(item)) or ("TFR" in str(item))
            )
            for item in data
        ]
    except Exception as e:
        print(f"❌ NOTAM Error: {e}")
        return []

def fetch_pireps(airports: list[str]) -> list[Pirep]:
    if not AVWX_TOKEN:
        return []  # PIREPs are optional
    
    pireps = []
    for icao in airports:
        try:
            url = f"{AVWX_BASE}/pirep/{icao}"
            print(f"🌐 Fetching PIREPs: {url}")
            r = requests.get(url, headers=headers, timeout=10)
            
            print(f"📊 PIREP Response Status for {icao}: {r.status_code}")
            
            if r.status_code == 200:
                data = r.json()
                print(f"📄 PIREP Data Type: {type(data)}")
                
                # Handle different response formats
                if isinstance(data, list):
                    for item in data:
                        pireps.append(
                            Pirep(
                                report=item.get("raw", str(item)) if isinstance(item, dict) else str(item),
                                altitude=item.get("altitude", {}).get("value") if isinstance(item, dict) else None,
                                location=icao
                            )
                        )
                elif isinstance(data, dict):
                    pireps.append(
                        Pirep(
                            report=data.get("raw", "N/A"),
                            altitude=data.get("altitude", {}).get("value"),
                            location=icao
                        )
                    )
        except Exception as e:
            print(f"❌ PIREP Error for {icao}: {e}")
            continue
    
    print(f"📈 Total PIREPs collected: {len(pireps)}")
    return pireps
