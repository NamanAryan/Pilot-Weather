from models.route import RoutePoint
from models.weather import Pirep
from typing import List
import math

def _great_circle_points(lat1: float, lon1: float, lat2: float, lon2: float, segments: int = 64) -> List[RoutePoint]:
    """Generate intermediate points along great-circle between two coords.
    Returns a dense polyline suitable for map display.
    """
    # Convert to radians
    φ1, λ1, φ2, λ2 = map(math.radians, [lat1, lon1, lat2, lon2])
    δ = 2 * math.asin(
        math.sqrt(
            math.sin((φ2 - φ1) / 2) ** 2
            + math.cos(φ1) * math.cos(φ2) * math.sin((λ2 - λ1) / 2) ** 2
        )
    )
    if δ == 0:
        return [RoutePoint(lat=lat1, lon=lon1, altitude=0)]

    points: List[RoutePoint] = []
    for i in range(segments + 1):
        f = i / segments
        A = math.sin((1 - f) * δ) / math.sin(δ)
        B = math.sin(f * δ) / math.sin(δ)
        x = A * math.cos(φ1) * math.cos(λ1) + B * math.cos(φ2) * math.cos(λ2)
        y = A * math.cos(φ1) * math.sin(λ1) + B * math.cos(φ2) * math.sin(λ2)
        z = A * math.sin(φ1) + B * math.sin(φ2)
        φ = math.atan2(z, math.sqrt(x * x + y * y))
        λ = math.atan2(y, x)
        points.append(RoutePoint(lat=math.degrees(φ), lon=math.degrees(λ), altitude=35000))
    return points

def fetch_route(src: str, dest: str) -> List[RoutePoint]:
    """
    Return actual route polyline using great circle calculation.
    """
    print(f"🛫 Fetching route from {src} to {dest}")
    
    # Comprehensive airport coordinates including Indian airports
    airport_coords = {
        # North America
        "KJFK": (40.6413, -73.7781),  # New York JFK
        "KATL": (33.6407, -84.4277), # Atlanta
        "KORD": (41.9786, -87.9048), # Chicago O'Hare
        "KLAX": (33.9425, -118.4081), # Los Angeles
        "KSFO": (37.6213, -122.3790), # San Francisco
        "CYYZ": (43.6777, -79.6306), # Toronto
        
        # Europe
        "EGLL": (51.4700, -0.4543),  # London Heathrow
        "LFPG": (49.0097, 2.5479),   # Paris CDG
        "EDDF": (50.0379, 8.5622),  # Frankfurt
        "EHAM": (52.3105, 4.7683),   # Amsterdam
        "LSGG": (46.2381, 6.1090),   # Geneva
        "LOWW": (48.1103, 16.5697),  # Vienna
        "LEMD": (40.4839, -3.5680),  # Madrid
        "LIRF": (41.8045, 12.2509),  # Rome Fiumicino
        "LTBA": (41.2753, 28.7519),  # Istanbul
        "UUEE": (55.9726, 37.4146),  # Moscow Sheremetyevo
        
        # Middle East
        "OMDB": (25.2532, 55.3657),  # Dubai
        "OTHH": (25.2731, 51.6081),  # Doha
        "OMAA": (24.4330, 54.6511),  # Abu Dhabi
        "OOMS": (23.5933, 58.2844),  # Muscat
        "OEDF": (24.7139, 46.6753),  # Riyadh
        
        # Asia
        "ZBAA": (40.0799, 116.6031), # Beijing Capital
        "RJTT": (35.7720, 140.3928), # Tokyo Haneda
        "RJAA": (35.7720, 140.3863), # Tokyo Narita
        "RJGG": (35.2553, 136.9243), # Nagoya
        "RJFK": (33.5859, 130.4510), # Fukuoka
        "RJCC": (43.0642, 141.3469), # Sapporo
        "WSSS": (1.3644, 103.9915),  # Singapore Changi
        "VHHH": (22.3080, 113.9185), # Hong Kong
        "RKSI": (37.4602, 126.4407), # Seoul Incheon
        "VTBS": (13.6900, 100.7501), # Bangkok Suvarnabhumi
        "WMKK": (2.7456, 101.7099),  # Kuala Lumpur
        "RCTP": (25.0777, 121.2328), # Taipei Taoyuan
        "RCSS": (25.0697, 121.5519), # Taipei Songshan
        
        # India - Major Airports
        "VIDP": (28.5562, 77.1000),  # Delhi Indira Gandhi
        "VABB": (19.0887, 72.8679),  # Mumbai Chhatrapati Shivaji
        "VOBL": (13.1986, 77.7066),  # Bengaluru Kempegowda
        "VASU": (21.1702, 72.8311),  # Surat
        "VAAH": (23.0772, 72.6346),  # Ahmedabad Sardar Vallabhbhai Patel
        "VOMM": (12.9941, 80.1709),  # Chennai
        "VECC": (22.6546, 88.4467),  # Kolkata Netaji Subhas Chandra Bose
        "VAGO": (15.3808, 73.8314),  # Goa Dabolim
        "VAPO": (18.5821, 73.9197),  # Pune
        "VOHY": (17.4531, 78.4676),  # Hyderabad Rajiv Gandhi
        "VANP": (21.0921, 79.0472),  # Nagpur Dr. Babasaheb Ambedkar
        "VOML": (12.9612, 74.8902),  # Mangaluru
        "VOCB": (11.0300, 77.0434),  # Coimbatore
        "VOTV": (8.4821, 76.9200),   # Thiruvananthapuram
        "VOCL": (10.1520, 76.4019),  # Kochi
        "VOCP": (11.1362, 75.9553),  # Calicut
        "VOTR": (10.7654, 78.7097),  # Tiruchirapalli
        "VOMD": (9.8345, 78.0934),   # Madurai
        "VOTP": (16.5304, 80.7968),  # Vijayawada
        "VOBZ": (16.5304, 80.7968),  # Visakhapatnam
        "VEPB": (25.5913, 85.0879),  # Patna
        "VEGT": (26.1061, 91.5859),  # Guwahati
        
        # Other regions
        "VCBI": (7.1808, 79.8841),   # Colombo
        "YSSY": (-33.9399, 151.1753), # Sydney
        "NZAA": (-37.0082, 174.7850), # Auckland
        "SBGR": (-23.4356, -46.4731), # São Paulo Guarulhos
        "SAEZ": (-34.8222, -58.5358), # Buenos Aires Ezeiza
        "FAOR": (-26.1392, 28.2460), # Johannesburg
        "HECA": (30.1127, 31.4000),  # Cairo
        "OAKB": (34.5654, 69.2123),  # Kabul
    }
    
    src_coords = airport_coords.get(src.upper())
    dest_coords = airport_coords.get(dest.upper())
    
    if not src_coords or not dest_coords:
        print(f"⚠️ Unknown airport coordinates for {src} or {dest}")
        # Fallback to generic coordinates
        src_coords = (40.0, -70.0)  # Generic US East Coast
        dest_coords = (50.0, 0.0)   # Generic Europe
    
    lat1, lon1 = src_coords
    lat2, lon2 = dest_coords
    
    print(f"📍 Route: {src} ({lat1:.2f}, {lon1:.2f}) → {dest} ({lat2:.2f}, {lon2:.2f})")
    
    # Use great circle calculation with 64 segments for smooth curves
    return _great_circle_points(lat1, lon1, lat2, lon2, segments=64)

def map_hazards(route: List[RoutePoint], pireps: List[Pirep], metars: List = None) -> List[str]:
    hazards = []
    
    # Analyze PIREPs for turbulence
    for p in pireps:
        if p.altitude and 28000 <= p.altitude <= 36000:
            hazards.append(f"Turbulence reported at FL{p.altitude//100} near {p.location}")
    
    # Analyze METARs for weather hazards
    if metars:
        for metar in metars:
            if not metar.raw_text:
                continue
                
            raw_text = metar.raw_text.upper()
            
            # Check for thunderstorms
            if "TS" in raw_text or "THUNDERSTORM" in raw_text:
                hazards.append(f"Thunderstorm activity reported at {metar.station}")
            
            # Check for heavy precipitation
            if "SH" in raw_text or "SHOWER" in raw_text:
                if "DISTANT" in raw_text:
                    hazards.append(f"Distant showers reported near {metar.station}")
                else:
                    hazards.append(f"Showers reported at {metar.station}")
            
            # Check for low visibility
            if "FG" in raw_text or "FOG" in raw_text:
                hazards.append(f"Fog conditions at {metar.station}")
            
            # Check for icing conditions
            if "IC" in raw_text or "ICE" in raw_text:
                hazards.append(f"Icing conditions reported at {metar.station}")
            
            # Check for strong winds
            if "G" in raw_text and any(char.isdigit() for char in raw_text):
                # Look for gust patterns like "G25KT" or "G30KT"
                import re
                gusts = re.findall(r'G(\d+)KT', raw_text)
                if gusts and int(gusts[0]) > 20:
                    hazards.append(f"Strong gusts up to {gusts[0]}KT at {metar.station}")
            
            # Check for low ceilings
            if "OVC" in raw_text or "BKN" in raw_text:
                # Look for low cloud heights
                import re
                clouds = re.findall(r'(OVC|BKN)(\d{3})', raw_text)
                for cloud_type, height in clouds:
                    height_ft = int(height) * 100
                    if height_ft < 1000:
                        hazards.append(f"Low ceiling {height_ft}ft at {metar.station}")
                    elif height_ft < 3000:
                        hazards.append(f"Marginal ceiling {height_ft}ft at {metar.station}")
    
    return hazards
