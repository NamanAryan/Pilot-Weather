from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models.route import RouteRequest
from models.response import RouteAnalysisResponse
from services.weather import fetch_metar, fetch_taf, fetch_notams, fetch_pireps
from services.route import fetch_route, map_hazards
from services.airports import get_alternate_airports
from services.summary import summarize_weather

app = FastAPI(title="Aviation Pre-Flight Assistant")

# Add CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Your React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    return {"status": "ok", "message": "Aviation Pre-Flight Assistant API"}

@app.post("/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(req: RouteRequest):
    try:
        if len(req.airports) < 2:
            raise HTTPException(status_code=400, detail="At least 2 airports required")

        # Fetch weather data with error handling
        metars = []
        tafs = []
        for code in req.airports:
            try:
                metars.append(fetch_metar(code))
                tafs.append(fetch_taf(code))
            except Exception as e:
                print(f"Error fetching weather for {code}: {e}")
                # Continue with partial data

        # Fetch NOTAMs
        notams = []
        for code in req.airports:
            try:
                notams.extend(fetch_notams(code))
            except Exception as e:
                print(f"Error fetching NOTAMs for {code}: {e}")

        # Fetch PIREPs
        try:
            pireps = fetch_pireps(req.airports)
        except Exception as e:
            print(f"Error fetching PIREPs: {e}")
            pireps = []

        # Route and hazards
        try:
            route_points = fetch_route(req.airports[0], req.airports[-1])
            hazards = map_hazards(route_points, pireps)
        except Exception as e:
            print(f"Error processing route: {e}")
            route_points = []
            hazards = ["Error processing route hazards"]

        # Alternates
        try:
            alternates = get_alternate_airports(req.airports[-1])
        except Exception as e:
            print(f"Error fetching alternates: {e}")
            alternates = []

        # Summary
        try:
            summary_5line, summary_full = summarize_weather(metars, tafs, notams, pireps, hazards)
        except Exception as e:
            print(f"Error generating summary: {e}")
            summary_5line = f"Route: {' → '.join(req.airports)}\nSummary generation failed"
            summary_full = "Detailed summary unavailable"

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
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
