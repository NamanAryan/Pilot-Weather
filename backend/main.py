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
from services.airports import get_alternate_airports
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
            route_points = fetch_route(req.airports[0], req.airports[-1])
            hazards = map_hazards(route_points, pireps)
        except Exception as e:
            print(f"❌ Route error: {e}")
            route_points = []
            hazards = []
        
        print("🛬 Getting alternates...")
        try:
            alternates = get_alternate_airports(req.airports[-1])
        except Exception as e:
            print(f"❌ Alternates error: {e}")
            alternates = []
        
        print("📝 Generating summary...")
        try:
            summary_5line, summary_full = summarize_weather(metars, tafs, notams, pireps, hazards)
        except Exception as e:
            print(f"❌ Summary error: {e}")
            summary_5line = f"Route: {' → '.join(req.airports)}"
            summary_full = f"Summary generation failed: {str(e)}"

        print("✅ Building response...")
        return RouteAnalysisResponse(
            metars=metars,
            tafs=tafs,
            notams=notams,
            pireps=pireps,
            route=route_points,
            hazards=hazards,
            alternates=alternates,
            summary_5line=summary_5line,
            summary_full=summary_full,
        )
        
    except Exception as e:
        print(f"💥 FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")