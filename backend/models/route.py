from pydantic import BaseModel
from typing import List

class RouteRequest(BaseModel):
    airports: List[str]  # e.g. ["KJFK", "EGLL", "LFPG", "EDDF"]

class RoutePoint(BaseModel):
    lat: float
    lon: float
    altitude: int
