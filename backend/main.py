from fastapi import FastAPI, HTTPException
from models.route import RouteRequest
from models.response import RouteAnalysisResponse
from services.weather import fetch_metar, fetch_taf, fetch_notams, fetch_pireps
from services.route import fetch_route, map_hazards
from services.airports import get_alternate_airports
from services.summary import summarize_weather

app = FastAPI(title="Aviation Pre-Flight Assistant")

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/analyze-route", response_model=RouteAnalysisResponse)
def analyze_route(req: RouteRequest):
    if len(req.airports) < 2:
        raise HTTPException(status_code=400, detail="At least 2 airports required")

    metars = [fetch_metar(code) for code in req.airports]
    tafs = [fetch_taf(code) for code in req.airports]

    # flatten NOTAMs
    notams = []
    for code in req.airports:
        notams.extend(fetch_notams(code))

    pireps = fetch_pireps(req.airports)

    route_points = fetch_route(req.airports[0], req.airports[-1])
    hazards = map_hazards(route_points, pireps)

    alternates = get_alternate_airports(req.airports[-1])

    summary_5line, summary_full = summarize_weather(metars, tafs, notams, pireps, hazards)

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
