from dotenv import load_dotenv
import os

load_dotenv()

print("🔧 Environment Check:")
print(f"   AVWX_TOKEN: {'✅' if os.getenv('AVWX_TOKEN') else '❌ MISSING'}")
print(f"   GEMINI_API_KEY: {'✅' if os.getenv('GEMINI_API_KEY') else '❌ MISSING'}")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models.route import RouteRequest
from models.response import RouteAnalysisResponse
from services.weather import fetch_metar, fetch_taf, fetch_notams, fetch_pireps
from services.route import fetch_route, map_hazards
from services.airports import get_alternate_airports, get_top3_alternate_airports_by_category
from services.airports import get_airport_info
from services.summary import summarize_weather

app = FastAPI(title="Aviation Pre-Flight Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    return {
        "status": "ok", 
        "avwx_configured": bool(os.getenv("AVWX_TOKEN")),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY"))
    }


@app.get("/airport-info")
def airport_info(codes: str | None = None):
    """Return basic info for ICAO codes, including coords if available.

    Returns objects: {icao, name, latitude_deg, longitude_deg}
    """
    if not codes:
        return []
    results = []
    for raw in codes.replace(",", " ").split():
        try:
            info = get_airport_info(raw)
            if info:
                results.append({
                    "icao": info.get("icao"),
                    "name": info.get("name"),
                    "latitude_deg": info.get("latitude_deg"),
                    "longitude_deg": info.get("longitude_deg"),
                })
            else:
                results.append({"icao": raw.upper(), "name": None})
        except Exception:
            results.append({"icao": raw.upper(), "name": None})
    return results

@app.get("/airports/search")
def search_airports(q: str = ""):
    """Search airports by ICAO code or name for autocomplete.
    
    Returns: List of {icao, name, city, country} objects
    """
    if not q or len(q) < 2:
        return []
    
    import csv
    import os
    
    results = []
    airports_file = os.path.join(os.path.dirname(__file__), "data", "airports.csv")
    
    try:
        with open(airports_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                icao = row.get('icao_code', '').strip()
                name = row.get('name', '').strip()
                city = row.get('municipality', '').strip()
                country = row.get('iso_country', '').strip()
                
                # Only include airports with ICAO codes
                if not icao:
                    continue
                
                # Search in ICAO code, name, or city
                search_text = f"{icao} {name} {city}".lower()
                if q.lower() in search_text:
                    results.append({
                        "icao": icao,
                        "name": name,
                        "city": city,
                        "country": country
                    })
                    
                    # Limit results to 20 for performance
                    if len(results) >= 20:
                        break
                        
    except Exception as e:
        print(f"Error reading airports file: {e}")
        return []
    
    return results

@app.post("/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(req: RouteRequest):
    print(f"🛫 Processing route request: {req.airports}")
    
    if len(req.airports) < 2:
        raise HTTPException(status_code=400, detail="At least 2 airports required")

    try:
        print("🌤 Fetching weather data...")
        metars = []
        tafs = []
        
        for code in req.airports:
            try:
                print(f"📡 Processing {code}")
                metar = fetch_metar(code)
                taf = fetch_taf(code)
                metars.append(metar)
                tafs.append(taf)
                print(f"✅ Got weather for {code}")
            except Exception as e:
                print(f"❌ Weather error for {code}: {e}")
                raise e
        
        print("📢 Fetching NOTAMs...")
        notams = []
        for code in req.airports:
            try:
                notams.extend(fetch_notams(code))
            except Exception as e:
                print(f"❌ NOTAM error for {code}: {e}")
        
        print("✈ Fetching PIREPs...")
        try:
            pireps = fetch_pireps(req.airports)
        except Exception as e:
            print(f"❌ PIREP error: {e}")
            pireps = []
        
        print("🗺 Processing route...")
        try:
            # Create route connecting all airports in sequence
            route_points = []
            for i in range(len(req.airports) - 1):
                segment = fetch_route(req.airports[i], req.airports[i + 1])
                route_points.extend(segment)
            hazards = map_hazards(route_points, pireps, metars)
        except Exception as e:
            print(f"❌ Route error: {e}")
            route_points = []
            hazards = []
        
        print("🛬 Getting alternates...")
        try:
            alternates = get_alternate_airports(req.airports[-1])
            alternate_top3 = get_top3_alternate_airports_by_category(req.airports[-1])
        except Exception as e:
            print(f"❌ Alternates error: {e}")
            alternates = []
            from models.response import Airport  # Ensure Airport is imported for type hinting
            alternate_top3: dict[str, Airport | None] = {
                "least_deviation": None,
                "best_fuel_efficiency": None,
                "safest": None
            }
        
        print("📝 Generating summary...")
        try:
            summary_5line, summary_full = summarize_weather(metars, tafs, notams, pireps, hazards)
        except Exception as e:
            print(f"❌ Summary error: {e}")
            summary_5line = f"Route: {' → '.join(req.airports)}"
            summary_full = f"Summary generation failed: {str(e)}"

        print("📋 Generating detailed report...")
        try:
            from services.summary import generate_detailed_report
            detailed_report = generate_detailed_report(metars, tafs, notams, pireps, route_points, alternates, req.airports)
        except Exception as e:
            print(f"❌ Detailed report error: {e}")
            detailed_report = f"Detailed report generation failed: {str(e)}"

        print("✅ Building response...")
        return RouteAnalysisResponse(
            metars=metars,
            tafs=tafs,
            notams=notams,
            pireps=pireps,
            route=route_points,
            hazards=hazards,
            alternates=alternates,
            alternate_categories_single=alternate_top3,
            
            summary_5line=summary_5line,
            summary_full=summary_full,
            detailed_report=detailed_report,
        )
        
    except Exception as e:
        print(f"💥 FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")