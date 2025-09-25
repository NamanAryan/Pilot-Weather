def get_alternate_airports(dest: str) -> list:
    """
    Return alternates for given airport ICAO.
    Could be replaced with real dataset like OurAirports.
    """
    if dest == "KJFK":
        return [
            {"icao": "KEWR", "name": "Newark Intl", "lat": 40.6925, "lon": -74.1687, "services": ["fuel","customs"]},
            {"icao": "KLGA", "name": "LaGuardia", "lat": 40.7769, "lon": -73.8740, "services": ["fuel"]}
        ]
    return []
