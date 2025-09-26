from models.weather import Metar, Taf, Pirep
from models.notam import Notam
from typing import List, Tuple
import requests
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

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
    
    # Create a detailed basic summary from actual weather data
    summary_lines = [f"Route: {route_str}"]
    
    # Process METAR data for summary
    for metar in metars:
        if metar.raw_text and metar.raw_text != "":
            # Extract basic conditions from METAR
            conditions = []
            if "CLR" in metar.raw_text or "SKC" in metar.raw_text:
                conditions.append("Clear")
            elif "OVC" in metar.raw_text:
                conditions.append("Overcast")
            elif "BKN" in metar.raw_text:
                conditions.append("Broken clouds")
            elif "SCT" in metar.raw_text:
                conditions.append("Scattered clouds")
            elif "FEW" in metar.raw_text:
                conditions.append("Few clouds")
            
            # Extract visibility
            if "9999" in metar.raw_text:
                conditions.append("10+ mi vis")
            elif "CAVOK" in metar.raw_text:
                conditions.append("CAVOK")
            
            condition_str = ", ".join(conditions) if conditions else "Weather data available"
            summary_lines.append(f"{metar.station}: {condition_str}")
    
    # Add NOTAM and PIREP info
    if notams:
        critical_notams = [n for n in notams if n.critical]
        if critical_notams:
            summary_lines.append(f"⚠ {len(critical_notams)} critical NOTAMs")
        else:
            summary_lines.append(f"📋 {len(notams)} NOTAMs active")
    
    if pireps:
        summary_lines.append(f"✈ {len(pireps)} pilot reports available")
    
    basic_summary = "\n".join(summary_lines)
    
    if not GEMINI_API_KEY:
        print("❌ No Gemini API key found")
        return basic_summary, "Configure GEMINI_API_KEY for AI-powered summaries"
    
    try:
        print("🤖 Calling Gemini 2.5 Flash API...")
        
        # Use the correct model name from the documentation
        model = "gemini-2.5-flash"
        
        prompt = f"""You are a professional flight dispatcher. Create a concise pilot weather briefing.WRITE AIRPORT NAME IN BRACKET AFTER THE CODE

Route: {route_str}

Current Weather Reports:
{chr(10).join([f"{m.station}: {m.raw_text}" for m in metars if m.raw_text])}

Active NOTAMs: {len(notams)}
Pilot Reports: {len(pireps)}

Provide a brief 4-line pilot briefing focusing on: 
Start directly with the answer, no filler lines MAKE IT ATLEAST 5 LINES
1. Brief summary of weather condition from first airport in simple english terms (winds 280 at 10 knots, 1000ft clouds,10sm visibility)
2. Brief summary of weather condition from second airport in simple english terms
3. Brief of NOTAMs or SIGMETs if any
4. Any reported PIREPs
5. Any hazards along the route
Do include important details like wind direction and speed, visibility, cloud cover, and significant weather phenomena. Mention Remarks if any. (Dont miss any METAR info)"""
        
        # Use the correct API format from documentation
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ]
        }
        
        # Use the correct URL format from the REST example
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        
        headers = {
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json"
        }
        
        print(f"🌐 Making request to: {url}")
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        print(f"🤖 Gemini Response Status: {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text
            print(f"❌ Gemini API Error: {error_text}")
            return basic_summary, f"AI summary failed - using basic summary"
        
        result = response.json()
        print(f"📄 Gemini Response: {result}")
        
        # Extract the AI response
        if "candidates" in result and len(result["candidates"]) > 0:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                ai_text = candidate["content"]["parts"][0]["text"]
                print("✅ Successfully got AI summary")
                return ai_text.strip(), ai_text.strip()
            else:
                print("❌ Unexpected response structure")
                return basic_summary, "AI response format error"
        else:
            print("❌ No candidates in response")
            return basic_summary, "No AI response generated"
        
    except requests.exceptions.Timeout:
        print("⏱ Gemini API request timed out")
        return basic_summary, "AI summary timed out"
    except Exception as e:
        print(f"💥 Error calling Gemini API: {e}")
        return basic_summary, f"AI summary error: {str(e)}"
    