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
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://pilot-weather-frontend.vercel.app,https://www.pilot-weather-frontend.vercel.app,https://weathaware.vercel.app,https://www.weathaware.vercel.app").split(",")

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
    allowed_hosts=[
        "pilot-weather-backend.onrender.com",
        "weathaware.vercel.app", 
        "www.weathaware.vercel.app"
    ]
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
@app.head("/")
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

# Global cache for airports data
_airports_cache = None
_airports_index = None
_search_results_cache = {}  # Simple cache for search results

def _load_airports_data():
    """Load airports data into memory cache with search indexes."""
    global _airports_cache, _airports_index
    
    if _airports_cache is not None:
        return _airports_cache, _airports_index
    
    import csv
    import os
    import requests
    from io import StringIO
    
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
        
        # Process and index airports data
        processed_airports = []
        icao_index = {}
        name_index = {}
        city_index = {}
        
        for row in airports_data:
            icao = row.get('icao_code', '').strip()
            ident = row.get('ident', '').strip()
            name = row.get('name', '').strip()
            city = row.get('municipality', '').strip()
            country = row.get('iso_country', '').strip()
            
            # Use ICAO code if available, otherwise use ident
            airport_code = icao if icao else ident
            
            # Only include airports with codes
            if not airport_code:
                continue
            
            airport_obj = {
                "icao": airport_code,
                "name": name,
                "city": city,
                "country": country
            }
            
            processed_airports.append(airport_obj)
            
            # Build indexes for faster searching
            code_lower = airport_code.lower()
            name_lower = name.lower()
            city_lower = city.lower()
            
            # ICAO code index
            icao_index[code_lower] = airport_obj
            
            # Name index (first few characters)
            for i in range(1, min(len(name_lower) + 1, 10)):
                prefix = name_lower[:i]
                if prefix not in name_index:
                    name_index[prefix] = []
                name_index[prefix].append(airport_obj)
            
            # City index (first few characters)
            for i in range(1, min(len(city_lower) + 1, 10)):
                prefix = city_lower[:i]
                if prefix not in city_index:
                    city_index[prefix] = []
                city_index[prefix].append(airport_obj)
        
        _airports_cache = processed_airports
        _airports_index = {
            'icao': icao_index,
            'name': name_index,
            'city': city_index
        }
        
        print(f"✅ Loaded {len(processed_airports)} airports into cache with indexes")
        return _airports_cache, _airports_index
        
    except Exception as e:
        print(f"❌ Error loading airports data: {e}")
        return [], {}

@app.get("/airports/search")
def search_airports(q: str = ""):
    """Search airports by ICAO code or name for autocomplete.
    
    Returns: List of {icao, name, city, country} objects
    """
    print(f"🔍 Airport search request: '{q}'")
    if not q or len(q) < 2:
        print("❌ Query too short")
        return []
    
    q_lower = q.lower().strip()
    
    # Check cache first
    if q_lower in _search_results_cache:
        print(f"✅ Cache hit for query '{q}'")
        return _search_results_cache[q_lower]
    
    # Load airports data (cached after first load)
    airports_data, airports_index = _load_airports_data()
    
    if not airports_data:
        return []
    
    results = []
    
    try:
        # Priority 1: Exact ICAO code match
        if q_lower in airports_index['icao']:
            exact_match = airports_index['icao'][q_lower]
            results.append(exact_match)
        
        # Priority 2: ICAO code prefix matches
        for code, airport in airports_index['icao'].items():
            if code.startswith(q_lower) and airport not in results:
                results.append(airport)
                if len(results) >= 10:  # Limit ICAO matches
                    break
        
        # Priority 3: Name prefix matches
        if len(results) < 15:  # Leave room for other matches
            for prefix_length in range(len(q_lower), 0, -1):
                prefix = q_lower[:prefix_length]
                if prefix in airports_index['name']:
                    for airport in airports_index['name'][prefix]:
                        if airport not in results:
                            results.append(airport)
                            if len(results) >= 15:
                                break
                    if len(results) >= 15:
                        break
        
        # Priority 4: City prefix matches
        if len(results) < 20:  # Leave room for other matches
            for prefix_length in range(len(q_lower), 0, -1):
                prefix = q_lower[:prefix_length]
                if prefix in airports_index['city']:
                    for airport in airports_index['city'][prefix]:
                        if airport not in results:
                            results.append(airport)
                            if len(results) >= 20:
                                break
                    if len(results) >= 20:
                        break
        
        # Priority 5: Fallback to substring search for remaining slots
        if len(results) < 20:
            for airport in airports_data:
                if airport in results:
                    continue
                
                search_text = f"{airport['icao']} {airport['name']} {airport['city']}".lower()
                if q_lower in search_text:
                    results.append(airport)
                    if len(results) >= 20:
                        break
        
        # Sort results by relevance (exact ICAO matches first, then by name length)
        def sort_key(airport):
            code_match = airport['icao'].lower() == q_lower
            prefix_match = airport['icao'].lower().startswith(q_lower)
            name_match = airport['name'].lower().startswith(q_lower)
            
            if code_match:
                return (0, len(airport['name']))
            elif prefix_match:
                return (1, len(airport['name']))
            elif name_match:
                return (2, len(airport['name']))
            else:
                return (3, len(airport['name']))
        
        results.sort(key=sort_key)
        
    except Exception as e:
        print(f"❌ Error searching airports: {e}")
        return []
    
    print(f"✅ Found {len(results)} airports for query '{q}'")
    
    # Cache the results (limit cache size to prevent memory issues)
    if len(_search_results_cache) < 1000:  # Limit cache to 1000 entries
        _search_results_cache[q_lower] = results[:20]
    
    return results[:20]  # Limit to 20 results

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