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

def check_avwx_permissions():
    """Check what AVWX API endpoints are accessible with current token"""
    if not AVWX_TOKEN:
        print("⚠️ No AVWX token configured")
        return
    
    print("🔍 Checking AVWX API permissions...")
    
    # Test basic METAR access (should work with any valid token)
    try:
        test_url = f"{AVWX_BASE}/metar/KJFK"
        r = requests.get(test_url, headers=headers, timeout=5)
        if r.status_code == 200:
            print("✅ METAR access: OK")
        else:
            print(f"❌ METAR access: {r.status_code}")
    except Exception as e:
        print(f"❌ METAR test failed: {e}")
    
    # Test NOTAM access
    try:
        test_url = f"{AVWX_BASE}/notam/KJFK"
        r = requests.get(test_url, headers=headers, timeout=5)
        if r.status_code == 200:
            print("✅ NOTAM access: OK")
        elif r.status_code == 403:
            print("🚫 NOTAM access: DENIED (403) - requires paid plan")
        else:
            print(f"❌ NOTAM access: {r.status_code}")
    except Exception as e:
        print(f"❌ NOTAM test failed: {e}")
    
    # Test TAF access
    try:
        test_url = f"{AVWX_BASE}/taf/KJFK"
        r = requests.get(test_url, headers=headers, timeout=5)
        if r.status_code == 200:
            print("✅ TAF access: OK")
        else:
            print(f"❌ TAF access: {r.status_code}")
    except Exception as e:
        print(f"❌ TAF test failed: {e}")

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
    
    # Handle empty or invalid responses
    if data is None:
        print(f"⚠️ Empty METAR response for {icao}")
        data = {}
    elif isinstance(data, list):
        data = data[0] if data else {}
    elif not isinstance(data, dict):
        print(f"⚠️ Unexpected METAR data type for {icao}: {type(data)}")
        data = {}
    
    # Ensure data is a dict, not None
    if data is None:
        data = {}
    
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
    
    # Handle empty or invalid responses
    if data is None:
        print(f"⚠️ Empty TAF response for {icao}")
        data = {}
    elif isinstance(data, list):
        data = data[0] if data else {}
    elif not isinstance(data, dict):
        print(f"⚠️ Unexpected TAF data type for {icao}: {type(data)}")
        data = {}
    
    # Ensure data is a dict, not None
    if data is None:
        data = {}
    
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
        print("⚠️ No AVWX token configured - skipping NOTAMs")
        return []  # NOTAMs are optional
    
    try:
        url = f"{AVWX_BASE}/notam/{icao}"
        print(f"🌐 Fetching NOTAMs: {url}")
        r = requests.get(url, headers=headers, timeout=10)
        
        print(f"📊 NOTAM Response Status: {r.status_code}")
        
        if r.status_code == 403:
            print(f"🚫 NOTAM Access Denied (403) for {icao}")
            print("💡 This usually means your AVWX plan doesn't include NOTAM access")
            print("💡 NOTAMs require a paid AVWX subscription plan")
            return []
        elif r.status_code == 404:
            print(f"📭 No NOTAMs found for {icao}")
            return []
        elif r.status_code != 200:
            print(f"❌ NOTAM API Error {r.status_code} for {icao}: {r.text}")
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
