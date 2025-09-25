from models.weather import Metar, Taf, Pirep
from models.notam import Notam
from typing import List, Tuple
import requests
import os

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

def summarize_weather(
    metars: List[Metar],
    tafs: List[Taf],
    notams: List[Notam],
    pireps: List[Pirep],
    hazards: List[str]
) -> Tuple[str, str]:
    """
    Summarize all aviation data into 5-line and 2-page formats using Gemini
    """
    prompt = f"""
    Summarize the following aviation weather and route info into:
    (1) 5-line pilot briefing with critical SIGMET/NOTAM/hazard info.
    (2) Detailed 2-page preflight report.

    METARs: {[m.raw_text for m in metars]}
    TAFs: {[t.raw_text for t in tafs]}
    NOTAMs: {[n.text for n in notams]}
    PIREPs: {[p.report for p in pireps]}
    Hazards: {hazards}
    """

    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload)
    if r.status_code != 200:
        return ("Summary unavailable", "Summary unavailable")

    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    # simple split: first 5 lines vs rest
    lines = text.split("\n")
    summary_5line = "\n".join(lines[:5])
    summary_full = text
    return summary_5line, summary_full
