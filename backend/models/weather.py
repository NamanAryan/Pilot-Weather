from pydantic import BaseModel
from typing import Optional

class Metar(BaseModel):
    station: str
    raw_text: str
    temperature: Optional[float] = None
    wind: Optional[str] = None
    visibility: Optional[str] = None
    conditions: Optional[str] = None

class Taf(BaseModel):
    station: str
    raw_text: str
    forecast: Optional[str] = None

class Pirep(BaseModel):
    report: str
    altitude: Optional[int] = None
    location: Optional[str] = None
