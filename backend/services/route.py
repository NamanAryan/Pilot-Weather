import requests

def fetch_route(airports: list) -> list:
    """
    For hackathon: return waypoints as straight line between airports
    Replace with OpenSky API if needed.
    """
    # Ideally call OpenSky or FAA API here, mock for now:
    mock_coords = {
        "KJFK": (40.6413, -73.7781),
        "KLAX": (33.9416, -118.4085),
        "EGLL": (51.4700, -0.4543),
        "VOBL": (13.1989, 77.7063)
    }
    route = []
    for icao in airports:
        lat, lon = mock_coords.get(icao, (0, 0))
        route.append({"icao": icao, "lat": lat, "lon": lon})
    return route

def map_hazards(route: list) -> list:
    """
    Mock hazards - in real use, integrate SIGMET API
    """
    hazards = [
        {"lat": route[0]["lat"]+1, "lon": route[0]["lon"]+1,
         "type": "Thunderstorm", "severity": "Severe", "flight_level": "FL350"}
    ]
    return hazards
