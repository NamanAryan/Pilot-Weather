import os
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

def summarize_weather(bundle: dict, report_type: str) -> str:
    prompt = f"""
    You are an aviation assistant.
    Summarize this flight data into a { '5-line critical summary' if report_type == '5line' else '2-page detailed report' }.
    Focus on hazards, optimal flight level, NOTAMs (mark critical), TFRs, and alternate airports.

    Data: {bundle}
    """
    payload = {"contents": [{"parts":[{"text": prompt}]}]}
    res = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload)
    if res.ok:
        return res.json()["candidates"][0]["content"]["parts"][0]["text"]
    return "LLM summarization failed"
