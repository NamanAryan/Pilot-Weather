from models.airport import Airport
from typing import List

def get_alternate_airports(dest_icao: str) -> List[Airport]:
    # Dummy static alternates – later replace with real API (OurAirports, ICAO dataset)
    alternates = [
        Airport(icao="EGKK", name="London Gatwick", lat=51.1537, lon=-0.1821, runway_length=3316, has_fuel=True),
        Airport(icao="EGSS", name="London Stansted", lat=51.8850, lon=0.2350, runway_length=3048, has_fuel=True)
    ]
    return alternates
