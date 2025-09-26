from pydantic import BaseModel
from typing import List, Optional, Dict
from .weather import Metar, Taf, Pirep
from .notam import Notam
from .airport import Airport
from .route import RoutePoint

class RouteAnalysisResponse(BaseModel):
    metars: List[Metar]
    tafs: List[Taf]
    notams: List[Notam]
    pireps: List[Pirep]
    route: List[RoutePoint]
    hazards: List[str]
    alternates: List[Airport]
    alternate_categories: Optional[dict] = None
    alternate_categories_single: Optional[Dict[str, Optional[Airport]]] = None
    summary_5line: str
    summary_full: Optional[str] = None
    detailed_report: Optional[str] = None
