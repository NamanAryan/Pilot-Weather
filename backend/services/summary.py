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
Do include important details like wind direction and speed, visibility, cloud cover, and significant weather phenomena. Mention Remarks if any. (Dont miss any METAR info).
Dont be inconsistent with the format of briefing, keep all details as above everytime."""
        
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


def generate_detailed_report(
    metars: List[Metar],
    tafs: List[Taf],
    notams: List[Notam],
    pireps: List[Pirep],
    route_points: List,
    alternates: List,
    airports: List[str]
) -> str:
    """Generate a detailed 7-section flight briefing using Gemini LLM with raw AVWX data."""
    
    if not GEMINI_API_KEY:
        return "Configure GEMINI_API_KEY for detailed AI-powered reports"
    
    try:
        print("🤖 Generating detailed report with Gemini...")
        
        model = "gemini-2.5-flash"
        route_str = " → ".join(airports)
        
        # Prepare detailed data for Gemini
        metar_data = "\n".join([f"{m.station}: {m.raw_text}" for m in metars if m.raw_text])
        taf_data = "\n".join([f"{t.station}: {t.raw_text}" for t in tafs if t.raw_text])
        notam_data = "\n".join([f"{n.airport} - {n.text}" for n in notams])
        pirep_data = "\n".join([f"{p.location}: {p.report}" for p in pireps])
        prompt = f"""You are a professional flight dispatcher. Create a comprehensive 6-section pre-flight weather briefing using ONLY the raw AVWX API data provided below.

Route: {route_str}

=== RAW AVWX DATA ===

METAR Data:
{metar_data}

TAF Data:
{taf_data}

NOTAM Data:
{notam_data}

PIREP Data:
{pirep_data}

Route Points: {len(route_points)} coordinates

=== FORMATTING REQUIREMENTS ===

Create a detailed briefing with these EXACT 6 sections (use these exact titles):

1. FLIGHT OVERVIEW
- Route summary with airport names
- Route type (direct/multi-leg)
- Total waypoints
- Safety note based on data

2. DEPARTURE AIRPORT ({airports[0] if airports else 'N/A'})
- METAR analysis (raw + decoded)
- TAF forecast if available
- Active NOTAMs for this airport
- Airport information

3. ENROUTE SEGMENT
- Route analysis
- PIREPs with altitude and location
- Weather hazards from METARs
- NOTAMs affecting route

4. DESTINATION AIRPORT ({airports[-1] if airports else 'N/A'})
- METAR analysis (raw + decoded)
- TAF forecast if available
- Active NOTAMs for this airport
- Landing conditions

5. HAZARD & RISK ASSESSMENT
- Start with "risk level: **RISK_LEVEL**" (where RISK_LEVEL is LOW RISK, MODERATE RISK, or HIGH RISK)
- Weather hazards from METAR analysis
- NOTAMs summary
- Recommended actions

6. OPERATIONAL NOTES
- Flight planning details
- Data sources
- Last updated
- Pilot advisories

CRITICAL FORMATTING RULES:
- Start each section with "1. SECTION NAME" (exactly as shown above)
- Use bullet points with "- " prefix for all items
- Use clean headers with "HEADER:" format for subsections (NO ** formatting)
- Use ONLY the raw data provided above
- Decode METAR/TAF data professionally
- Extract hazards from METAR codes (TS, SH, FG, IC, etc.)
- Be specific about wind, visibility, clouds, temperature
- Include all NOTAMs and PIREPs
- Make it comprehensive and professional
- Use clean, readable text without markdown formatting
- Highlight risk levels clearly using EXACT format: "risk level: **LOW RISK**", "risk level: **MODERATE RISK**", or "risk level: **HIGH RISK**"
- The risk level must be consistent throughout the report - if you state "MODERATE RISK" in the content, do NOT show "HIGH RISK" in headers

Start directly with "1. FLIGHT OVERVIEW" - no introduction or preamble."""
        
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
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json"
        }
        
        print(f"🌐 Making detailed report request to: {url}")
        
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        print(f"🤖 Detailed Report Response Status: {response.status_code}")
        
        if response.status_code != 200:
            error_text = response.text
            print(f"❌ Gemini API Error: {error_text}")
            return f"AI detailed report failed: {error_text}"
        
        result = response.json()
        print(f"📄 Detailed Report Response: {result}")
        
        if "candidates" in result and len(result["candidates"]) > 0:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                ai_text = candidate["content"]["parts"][0]["text"]
                print("✅ Successfully generated detailed report")
                return ai_text.strip()
            else:
                print("❌ Unexpected response structure")
                return "AI detailed report format error"
        else:
            print("❌ No candidates in response")
            return "No AI detailed report generated"
        
    except requests.exceptions.Timeout:
        print("⏱ Gemini API request timed out")
        return "AI detailed report timed out"
    except Exception as e:
        print(f"💥 Error calling Gemini API: {e}")
        return f"AI detailed report error: {str(e)}"
    