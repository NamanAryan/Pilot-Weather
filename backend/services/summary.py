from models.weather import Metar, Taf, Pirep
from models.notam import Notam
from typing import List, Tuple
import requests
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Use the correct Gemini API endpoint
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

print(f"🤖 GEMINI_API_KEY: {GEMINI_API_KEY}")

def summarize_weather(
    metars: List[Metar],
    tafs: List[Taf],
    notams: List[Notam],
    pireps: List[Pirep],
    hazards: List[str]
) -> Tuple[str, str]:
    
    print("📝 Starting weather summarization")
    
    airports = [m.station for m in metars]
    route_str = " → ".join(airports)
    
    # Create a basic summary first (fallback)
    basic_summary = f"""Route: {route_str}
Weather: {len(metars)} airports analyzed
Conditions: Mixed conditions reported
NOTAMs: {len(notams)} active notices
Recommendation: Review detailed weather data"""
    
    if not GEMINI_API_KEY:
        print("❌ No Gemini API key found")
        return basic_summary, "Configure GEMINI_API_KEY for AI-powered summaries"
    
    try:
        # Prepare weather summary for AI
        weather_summary = []
        for metar in metars:
            weather_summary.append(f"{metar.station}: {metar.raw_text}")
        
        prompt = f"""You are a professional flight dispatcher. Create a concise pilot briefing.

Route: {route_str}

Current Weather:
{chr(10).join(weather_summary)}

Provide a brief 4-line summary focusing on:
1. Overall weather conditions
2. Key hazards or concerns
3. Visibility and winds
4. Go/No-go recommendation"""
        
        print("🤖 Calling Gemini API...")
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
        
        # Use the correct API URL with your key
        url = f"{GEMINI_URL}?key={GEMINI_API_KEY}"
        print(f"🌐 Gemini URL: {url[:80]}...")  # Don't log the full key
        
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"🤖 Gemini Response Status: {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text
            print(f"❌ Gemini API Error: {error_text}")
            return basic_summary, f"AI summary failed - using basic summary"
        
        result = response.json()
        
        # Extract the AI response
        if "candidates" in result and len(result["candidates"]) > 0:
            ai_text = result["candidates"][0]["content"]["parts"][0]["text"]
            print("✅ Successfully got AI summary")
            return ai_text, ai_text
        else:
            print("❌ Unexpected Gemini response format")
            return basic_summary, "AI response format error"
        
    except requests.exceptions.Timeout:
        print("⏱️ Gemini API request timed out")
        return basic_summary, "AI summary timed out"
    except Exception as e:
        print(f"💥 Error calling Gemini API: {e}")
        return basic_summary, f"AI summary error: {str(e)}"
