from pydantic import BaseModel
from typing import Optional

class Notam(BaseModel):
    id: str
    airport: str
    text: str
    critical: bool = False
    category: Optional[str] = None
