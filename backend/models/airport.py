from pydantic import BaseModel
from typing import Optional

class Airport(BaseModel):
    icao: str
    name: Optional[str] = None
    lat: float
    lon: float
    runway_length: Optional[int] = None
    has_fuel: Optional[bool] = None
    has_customs: Optional[bool] = None
