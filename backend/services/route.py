from models.route import RoutePoint
from models.weather import Pirep
from typing import List

def fetch_route(src: str, dest: str) -> List[RoutePoint]:
    """
    Placeholder: return a simple straight line route.
    Later integrate OpenSky or flight plan API.
    """
    # fake demo route
    return [
        RoutePoint(lat=40.6413, lon=-73.7781, altitude=0),    # JFK
        RoutePoint(lat=51.4700, lon=-0.4543, altitude=35000)  # LHR
    ]

def map_hazards(route: List[RoutePoint], pireps: List[Pirep]) -> List[str]:
    hazards = []
    for p in pireps:
        if p.altitude and 28000 <= p.altitude <= 36000:
            hazards.append(f"Turbulence reported at FL{p.altitude//100} near {p.location}")
    return hazards
