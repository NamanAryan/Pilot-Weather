from dotenv import load_dotenv
import os
import logging
from typing import List

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment validation
required_env_vars = ["AVWX_TOKEN", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]
missing_vars = [var for var in required_env_vars if not os.getenv(var)]

if missing_vars:
    logger.warning(f"Missing environment variables: {', '.join(missing_vars)}")
    logger.warning("Some features may not work properly")

logger.info("🔧 Environment Check:")
logger.info(f"   AVWX_TOKEN: {'✅' if os.getenv('AVWX_TOKEN') else '❌ MISSING'}")
logger.info(f"   GEMINI_API_KEY: {'✅' if os.getenv('GEMINI_API_KEY') else '❌ MISSING'}")
logger.info(f"   SUPABASE_URL: {'✅' if os.getenv('SUPABASE_URL') else '❌ MISSING'}")
logger.info(f"   SUPABASE_ANON_KEY: {'✅' if os.getenv('SUPABASE_ANON_KEY') else '❌ MISSING'}")

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from models.route import RouteRequest
from models.response import RouteAnalysisResponse
from services.weather import fetch_metar, fetch_taf, fetch_notams, fetch_pireps
from services.route import fetch_route, map_hazards
from services.airports import get_alternate_airports, get_top3_alternate_airports_by_category
from services.airports import get_airport_info
from services.summary import summarize_weather

# Get allowed origins from environment
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(
    title="Aviation Pre-Flight Assistant",
    description="AI-powered weather briefing and hazard analysis system for pilots",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["*"] if os.getenv("ENVIRONMENT") == "development" else ["yourdomain.com", "*.yourdomain.com"]
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    """Health check endpoint"""
    return {
        "status": "ok", 
        "service": "Aviation Pre-Flight Assistant",
        "version": "1.0.0",
        "avwx_configured": bool(os.getenv("AVWX_TOKEN")),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "supabase_configured": bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_ANON_KEY"))
    }

@app.get("/health")
def detailed_health():
    """Detailed health check for monitoring"""
    return {
        "status": "healthy",
        "timestamp": "2024-01-01T00:00:00Z",  # This would be dynamic in real implementation
        "services": {
            "avwx": "configured" if os.getenv("AVWX_TOKEN") else "missing",
            "gemini": "configured" if os.getenv("GEMINI_API_KEY") else "missing",
            "supabase": "configured" if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_ANON_KEY") else "missing"
        }
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
    import requests
    from io import StringIO
    
    results = []
    airports_file = os.path.join(os.path.dirname(__file__), "data", "airports.csv")
    
    try:
        # Try to load from local file first
        if os.path.exists(airports_file):
            with open(airports_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                airports_data = list(reader)
        else:
            # Download from OurAirports if local file doesn't exist
            print("🌐 Downloading airports data from OurAirports...")
            url = "https://davidmegginson.github.io/ourairports-data/airports.csv"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Create data directory if it doesn't exist
            os.makedirs(os.path.dirname(airports_file), exist_ok=True)
            
            # Save to local file for future use
            with open(airports_file, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            # Parse the CSV data
            reader = csv.DictReader(StringIO(response.text))
            airports_data = list(reader)
            print(f"✅ Downloaded {len(airports_data)} airports")
        
        # Search through airports data
        for row in airports_data:
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
        print(f"Error reading airports data: {e}")
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