import pandas as pd
import requests
from geopy.distance import geodesic
from typing import List, Optional
import os
from io import StringIO
from models.airport import Airport

class AirportDataService:
    def _init_(self):
        self.airports_df = None
        self.data_file = "data/airports.csv"
        
    def load_airports_data(self) -> pd.DataFrame:
        """Load OurAirports CSV data (download if not exists)"""
        if self.airports_df is not None:
            return self.airports_df
            
        # Try to load from local file first
        if os.path.exists(self.data_file):
            print("📂 Loading airports from local CSV...")
            self.airports_df = pd.read_csv(self.data_file)
        else:
            print("🌐 Downloading OurAirports data...")
            url = "https://davidmegginson.github.io/ourairports-data/airports.csv"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Save to local file for future use
            os.makedirs("data", exist_ok=True)
            with open(self.data_file, 'w', encoding='utf-8') as f:
                f.write(response.text)
            
            self.airports_df = pd.read_csv(StringIO(response.text))
        
        print(f"✅ Loaded {len(self.airports_df)} airports")
        return self.airports_df
    
    def get_airport_by_icao(self, icao: str) -> Optional[dict]:
        """Get airport details by ICAO code"""
        df = self.load_airports_data()
        airport = df[df['ident'] == icao]
        
        if airport.empty:
            return None
            
        return airport.iloc[0].to_dict()
    
    def find_alternate_airports(self, dest_icao: str, radius_nm: int = 100, max_alternates: int = 3) -> List[Airport]:
        """Find suitable alternate airports within radius"""
        df = self.load_airports_data()
        
        # Get destination airport coordinates
        dest_airport = self.get_airport_by_icao(dest_icao)
        if not dest_airport:
            print(f"❌ Destination airport {dest_icao} not found")
            return self._get_hardcoded_alternates(dest_icao)
        
        dest_lat = dest_airport['latitude_deg']
        dest_lon = dest_airport['longitude_deg']
        
        # Filter for suitable airports
        suitable_airports = df[
            (df['type'].isin(['large_airport', 'medium_airport'])) &  # Commercial airports
            (df['ident'] != dest_icao) &  # Not destination
            (df['ident'].str.len() == 4) &  # Valid ICAO codes
            (df['latitude_deg'].notna()) &
            (df['longitude_deg'].notna()) &
            (df['scheduled_service'] == 'yes')  # Has airline service
        ].copy()
        
        if suitable_airports.empty:
            return self._get_hardcoded_alternates(dest_icao)
        
        # Calculate distances
        suitable_airports['distance_km'] = suitable_airports.apply(
            lambda row: geodesic(
                (dest_lat, dest_lon),
                (row['latitude_deg'], row['longitude_deg'])
            ).kilometers,
            axis=1
        )
        
        # Convert nautical miles to kilometers (1 NM = 1.852 KM)
        radius_km = radius_nm * 1.852
        
        # Filter by distance and sort
        nearby = suitable_airports[
            suitable_airports['distance_km'] <= radius_km
        ].sort_values('distance_km')
        
        alternates = []
        for _, airport in nearby.head(max_alternates).iterrows():
            alternates.append(Airport(
                icao=airport['ident'],
                name=airport['name'],
                lat=airport['latitude_deg'],
                lon=airport['longitude_deg'],
                runway_length=self._estimate_runway_length(airport['type']),
                has_fuel=airport['scheduled_service'] == 'yes'
            ))
        
        print(f"✅ Found {len(alternates)} alternate airports for {dest_icao}")
        return alternates
    
    def _estimate_runway_length(self, airport_type: str) -> int:
        """Estimate runway length based on airport type"""
        if 'large' in airport_type.lower():
            return 3500  # meters
        elif 'medium' in airport_type.lower():
            return 2500
        else:
            return 1800
    
    def _get_hardcoded_alternates(self, dest_icao: str) -> List[Airport]:
        """Fallback hardcoded alternates"""
        # India alternates for Indian airports
        if dest_icao.startswith('V'):
            return [
                Airport(icao="VABB", name="Mumbai", lat=19.0886, lon=72.8679, runway_length=3445, has_fuel=True),
                Airport(icao="VOBL", name="Bangalore", lat=13.1979, lon=77.7063, runway_length=3018, has_fuel=True)
            ]
        # Default international alternates
        return [
            Airport(icao="EGKK", name="London Gatwick", lat=51.1537, lon=-0.1821, runway_length=3316, has_fuel=True),
            Airport(icao="EGSS", name="London Stansted", lat=51.8850, lon=0.2350, runway_length=3048, has_fuel=True)
        ]

# Global instance
airport_service = AirportDataService()