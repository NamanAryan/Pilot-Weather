import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { ArrowLeft, RefreshCw, Plane, MapPin, FileText, Briefcase, AlertTriangle } from "lucide-react";
// Simple tab implementation without external dependencies

interface Briefing {
  summary_5line: string;
  summary_full?: string;
  detailed_report?: string;
  metars?: Array<{ 
    station: string; 
    raw_text: string;
    temperature?: number;
    wind?: string;
    visibility?: string;
    conditions?: string;
  }>;
  tafs?: Array<{
    station: string;
    raw_text: string;
    forecast?: string;
  }>;
  notams?: Array<{
    id: string;
    airport: string;
    text: string;
    critical: boolean;
    category?: string;
  }>;
  pireps?: Array<{
    report: string;
    altitude?: number;
    location?: string;
  }>;
  hazards?: string[];
  alternates?: Array<{ 
    icao: string; 
    name?: string | null;
    lat?: number;
    lon?: number;
    runway_length?: number;
    has_fuel?: boolean;
    has_customs?: boolean;
  }>;
  alternate_categories_single?: {
    least_deviation?: { icao: string; name?: string | null; lat?: number; lon?: number; runway_length?: number; has_fuel?: boolean; has_customs?: boolean; } | null;
    best_fuel_efficiency?: { icao: string; name?: string | null; lat?: number; lon?: number; runway_length?: number; has_fuel?: boolean; has_customs?: boolean; } | null;
    safest?: { icao: string; name?: string | null; lat?: number; lon?: number; runway_length?: number; has_fuel?: boolean; has_customs?: boolean; } | null;
  };
  route?: Array<{
    lat: number;
    lon: number;
    altitude: number;
  }>;
}

type AirportInfo = {
  icao: string;
  name?: string | null;
  latitude_deg?: number | null;
  longitude_deg?: number | null;
};

type Metar = {
  station: string;
  raw_text: string;
  temperature?: number;
  wind?: string;
  visibility?: string;
  conditions?: string;
};

declare global {
  interface Window {
    L: any;
  }
}

const leafletCSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function useScript(src: string) {
  useEffect(() => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = false; // Load synchronously for better reliability
    s.onerror = () => {
      console.error(`Failed to load script: ${src}`);
    };
    document.head.appendChild(s); // Append to head instead of body
    return () => {
      s.remove();
    };
  }, [src]);
}

function useStyle(href: string) {
  useEffect(() => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onerror = () => {
      console.error(`Failed to load stylesheet: ${href}`);
    };
    document.head.appendChild(l);
    return () => {
      l.remove();
    };
  }, [href]);
}

// Function to summarize METAR data in plain English
function summarizeMetar(metar: Metar): string {
  if (!metar) return "No weather data available";

  const parts: string[] = [];

  // Wind
  if (metar.wind) {
    parts.push(`Wind: ${metar.wind}`);
  }

  // Visibility
  if (metar.visibility) {
    parts.push(`Visibility: ${metar.visibility}`);
  }

  // Temperature
  if (metar.temperature !== undefined) {
    parts.push(`Temperature: ${metar.temperature}°C`);
  }

  // Weather conditions
  if (metar.conditions) {
    parts.push(`Conditions: ${metar.conditions}`);
  }

  return parts.length > 0 ? parts.join(". ") : "Standard conditions";
}

// Function to detect thunderstorms in METAR data
function hasThunderstorm(metar: Metar): boolean {
  if (!metar || !metar.raw_text) return false;
  const rawText = metar.raw_text.toUpperCase();
  return rawText.includes("TS") || rawText.includes("THUNDERSTORM") || rawText.includes("TEMPO");
}

// Function to generate thunderstorm polygon coordinates around an airport
function generateThunderstormPolygon(lat: number, lon: number, radiusKm: number = 25): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const numPoints = 12; // Number of points to create a circular polygon
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 360) / numPoints;
    const radians = (angle * Math.PI) / 180;
    
    // Convert km to degrees (approximate)
    const latOffset = (radiusKm / 111) * Math.cos(radians);
    const lonOffset = (radiusKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(radians);
    
    points.push([lat + latOffset, lon + lonOffset]);
  }
  
  return points;
}

// Function to extract airport-specific summary from AI-generated briefing
function getAirportSpecificSummary(airportCode: string, aiSummary: string, metar: Metar): string {
  if (!aiSummary) {
    return metar ? summarizeMetar(metar) : "No weather data available";
  }

  // Try to find airport-specific information in the AI summary
  const lines = aiSummary.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Look for lines that mention the specific airport
    if (line.toLowerCase().includes(airportCode.toLowerCase())) {
      return line.trim();
    }
    
    // Look for lines that mention airport names (common patterns)
    const airportNamePatterns = {
      'VABB': ['mumbai', 'bombay'],
      'VEBS': ['bhubaneswar', 'bhubaneshwar'],
      'VOBL': ['bangalore', 'bengaluru', 'bangaluru'],
      'VASU': ['surat'],
      'VIDP': ['delhi', 'new delhi'],
      'VECC': ['kolkata', 'calcutta'],
      'VOMM': ['chennai', 'madras'],
      'VAGO': ['goa'],
      'VAPO': ['pune']
    };
    
    const patterns = airportNamePatterns[airportCode as keyof typeof airportNamePatterns] || [];
    for (const pattern of patterns) {
      if (line.toLowerCase().includes(pattern)) {
        return line.trim();
      }
    }
  }
  
  // If no airport-specific line found, try to extract relevant weather info
  // Look for weather conditions that might apply to this airport
  const weatherKeywords = ['wind', 'visibility', 'cloud', 'temperature', 'rain', 'fog', 'clear'];
  for (const line of lines) {
    for (const keyword of weatherKeywords) {
      if (line.toLowerCase().includes(keyword)) {
        return line.trim();
      }
    }
  }
  
  // Fallback to METAR summary
  return metar ? summarizeMetar(metar) : "No weather data available";
}

function RouteMap({
  routeCodes,
  airportInfoMap,
  metars,
  briefing,
}: {
  routeCodes: string[];
  airportInfoMap: Record<string, AirportInfo>;
  metars: Metar[];
  briefing: Briefing;
}) {
  useStyle(leafletCSS);
  useScript(leafletJS);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 50; // 5 seconds max wait

    const initMap = () => {
      if (!window.L) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error("Leaflet failed to load after 5 seconds");
          (window as any).__briefingRouteError =
            "Failed to load map library. Please refresh the page.";
          return;
        }
        timeoutId = setTimeout(initMap, 100);
        return;
      }

      const L = window.L;
      const el = document.getElementById("route-map");
      if (!el) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error("Map container not found after 5 seconds");
          (window as any).__briefingRouteError = "Map container not found";
          return;
        }
        timeoutId = setTimeout(initMap, 100);
        return;
      }

      try {
        // Clear any existing map
        el.innerHTML = "";

        const map = L.map("route-map", {
          center: [22.9734, 78.6569],
          zoom: 5,
          zoomControl: true,
        });

        // Add tile layer with error handling
        const tileLayer = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 18,
            errorTileUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          }
        );

        tileLayer.addTo(map);

        // Markers for all known airports in the route
        const coords: Array<[number, number]> = [];
        const metarMap: Record<string, Metar> = {};
        metars.forEach((m) => {
          metarMap[m.station] = m;
        });

        routeCodes.forEach((code) => {
          const info = airportInfoMap[code];
          if (!info || !info.latitude_deg || !info.longitude_deg) return;

          const metar = metarMap[code];
          const hoverSummary = metar
            ? metar.raw_text
            : "No METAR";
          
          // Extract airport-specific summary from AI-generated briefing
          const clickSummary = getAirportSpecificSummary(code, briefing.summary_5line, metar);

          // Check for thunderstorms and add red polygon if present
          if (metar && hasThunderstorm(metar)) {
            const thunderstormPolygon = generateThunderstormPolygon(
              info.latitude_deg, 
              info.longitude_deg, 
              25 // 25km radius
            );
            
            const polygon = L.polygon(thunderstormPolygon, {
              color: '#dc2626', // Red color
              weight: 2,
              opacity: 0.8,
              fillColor: '#dc2626',
              fillOpacity: 0.3
            });
            
            polygon.bindTooltip(`⚠️ Thunderstorm Activity at ${code}`, {
              direction: "center",
              className: "thunderstorm-tooltip",
              permanent: false
            });
            
            polygon.bindPopup(
              `
              <div style="font-family: Arial, sans-serif; max-width: 300px;">
                <h3 style="margin: 0 0 8px 0; color: #dc2626; font-size: 16px;">⚠️ Thunderstorm Warning</h3>
                <p style="margin: 0; color: #374151; line-height: 1.4;"><strong>${code}</strong></p>
                <p style="margin: 4px 0; color: #374151; line-height: 1.4;">${metar.raw_text}</p>
                <p style="margin: 8px 0 0 0; color: #dc2626; font-size: 12px; font-weight: bold;">Exercise extreme caution when flying in this area.</p>
              </div>
            `,
              {
                maxWidth: 320,
                className: "thunderstorm-popup",
              }
            );
            
            polygon.addTo(map);
          }

          const marker = L.marker([info.latitude_deg, info.longitude_deg]);

          // Tooltip on hover (full raw METAR)
          marker.bindTooltip(`${code}: ${hoverSummary}`, { 
            direction: "top",
            className: "metar-tooltip",
            maxWidth: 400
          });

          // Popup on click (AI-generated summary)
          marker.bindPopup(
            `
            <div style="font-family: Arial, sans-serif; max-width: 300px;">
              <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px;">${code} Weather Summary</h3>
              <p style="margin: 0; color: #374151; line-height: 1.4;">${clickSummary}</p>
            </div>
          `,
            {
              maxWidth: 320,
              className: "airport-popup",
            }
          );

          marker.addTo(map);
          coords.push([info.latitude_deg, info.longitude_deg]);
        });

        // Draw route line connecting airport markers
        if (coords.length >= 2) {
          // Always connect the actual airport coordinates
          L.polyline(coords, { color: "#ec4899", weight: 3 }).addTo(map);
          
          // Also show the detailed route if available (as a different colored line)
          const realRoute: Array<{
            lat: number;
            lon: number;
            altitude?: number;
          }> = (window as any).__briefingRoute || [];
          if (Array.isArray(realRoute) && realRoute.length >= 2) {
            const rcoords = realRoute.map((p) => [p.lat, p.lon]);
            L.polyline(rcoords, { color: "#3b82f6", weight: 2, opacity: 0.7 }).addTo(map);
          }
          
          const group = L.featureGroup(coords.map((c) => L.marker(c)));
          map.fitBounds(group.getBounds().pad(0.2));
        } else if (coords.length === 1) {
          map.setView(coords[0], 7);
        } else {
          // Default view if no airports found
          map.setView([22.9734, 78.6569], 3);
        }

        // Add custom CSS for popup styling
        const style = document.createElement("style");
        style.textContent = `
          .airport-popup .leaflet-popup-content-wrapper {
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .airport-popup .leaflet-popup-content {
            margin: 12px 16px;
            line-height: 1.4;
          }
          .airport-popup .leaflet-popup-tip {
            background: white;
          }
          .thunderstorm-popup .leaflet-popup-content-wrapper {
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.3);
            border: 2px solid #dc2626;
          }
          .thunderstorm-popup .leaflet-popup-content {
            margin: 12px 16px;
            line-height: 1.4;
          }
          .thunderstorm-popup .leaflet-popup-tip {
            background: #dc2626;
          }
          .thunderstorm-tooltip {
            background: #dc2626 !important;
            color: white !important;
            border: none !important;
            font-weight: bold !important;
            font-size: 12px !important;
          }
          .thunderstorm-tooltip::before {
            border-top-color: #dc2626 !important;
          }
        `;
        document.head.appendChild(style);

        // Store map reference for cleanup
        (window as any).__routeMap = map;
        console.log("Map initialized successfully");
      } catch (error) {
        console.error("Map initialization error:", error);
        (window as any).__briefingRouteError =
          "Failed to initialize map: " + (error as Error).message;
      }
    };

    initMap();

    return () => {
      // Clean up timeout and map
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if ((window as any).__routeMap) {
        (window as any).__routeMap.remove();
        (window as any).__routeMap = null;
      }
    };
  }, [routeCodes.join("|"), airportInfoMap, metars]);

  const routeError = (window as any).__briefingRouteError as string | undefined;
  const isLoading = (window as any).__briefingRouteLoaded === false;
  const mapLoaded = (window as any).__routeMap !== undefined;

  return (
    <div>
      {isLoading && (
        <div className="mb-2 text-sm text-gray-600">Loading route map…</div>
      )}
      {routeError && (
        <div className="mb-2 text-sm text-red-600">{routeError}</div>
      )}
      {!mapLoaded && !isLoading && !routeError && (
        <div className="mb-2 text-sm text-gray-500">Initializing map...</div>
      )}
      <div
        id="route-map"
        style={{
          height: 400,
          borderRadius: 12,
          backgroundColor: mapLoaded ? "transparent" : "#f3f4f6",
          border: "1px solid #e5e7eb",
        }}
      />
    </div>
  );
}

// Detailed Report Component - Formats AI-generated report with proper styling
function DetailedReport({ 
  briefing, 
  flight: _flight, 
  airportInfoMap: _airportInfoMap 
}: { 
  briefing: Briefing; 
  flight: any; 
  airportInfoMap: Record<string, AirportInfo> 
}) {
  // Debug logging to see what data we're actually getting
  console.log('DetailedReport Debug:', {
    metars: briefing.metars?.length || 0,
    tafs: briefing.tafs?.length || 0,
    notams: briefing.notams?.length || 0,
    pireps: briefing.pireps?.length || 0,
    hazards: briefing.hazards?.length || 0,
    route: briefing.route?.length || 0,
    alternates: briefing.alternates?.length || 0,
    hasDetailedReport: !!briefing.detailed_report
  });
  
  // Function to parse AI report and format it into sections
  const parseAIReport = (report: string) => {
    const sections = [];
    const lines = report.split('\n');
    let currentSection = { title: '', content: '', icon: Briefcase };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for section headers
      if (line.match(/^\d+\.\s+(.+)/)) {
        // Save previous section if it exists
        if (currentSection.title) {
          sections.push({ ...currentSection });
        }
        
        // Start new section
        const title = line.replace(/^\d+\.\s+/, '');
        currentSection = {
          title,
          content: '',
          icon: getIconForSection(title)
        };
      } else if (line && !line.startsWith('===') && !line.startsWith('IMPORTANT:')) {
        // Add content to current section
        if (currentSection.content) {
          currentSection.content += '\n' + line;
        } else {
          currentSection.content = line;
        }
      }
    }
    
    // Add the last section
    if (currentSection.title) {
      sections.push({ ...currentSection });
    }
    
    return sections;
  };
  
  // Function to get appropriate icon for each section
  const getIconForSection = (title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('flight overview') || lowerTitle.includes('overview')) return Briefcase;
    if (lowerTitle.includes('departure')) return Plane;
    if (lowerTitle.includes('enroute') || lowerTitle.includes('segment')) return MapPin;
    if (lowerTitle.includes('destination') || lowerTitle.includes('arrival')) return Plane;
    if (lowerTitle.includes('alternate')) return MapPin;
    if (lowerTitle.includes('hazard') || lowerTitle.includes('risk')) return AlertTriangle;
    if (lowerTitle.includes('operational') || lowerTitle.includes('notes')) return FileText;
    return Briefcase;
  };
  
  // Function to get color for section icon
  const getIconColor = (title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('departure')) return 'text-green-600';
    if (lowerTitle.includes('enroute') || lowerTitle.includes('segment')) return 'text-orange-600';
    if (lowerTitle.includes('destination') || lowerTitle.includes('arrival')) return 'text-red-600';
    if (lowerTitle.includes('alternate')) return 'text-purple-600';
    if (lowerTitle.includes('hazard') || lowerTitle.includes('risk')) return 'text-red-600';
    if (lowerTitle.includes('operational') || lowerTitle.includes('notes')) return 'text-blue-600';
    return 'text-blue-600';
  };
  
  // Function to highlight critical words in text
  const highlightCriticalWords = (text: string) => {
    const criticalWords = [
      'risk', 'thunderstorm', 'turbulence', 'icing', 'fog', 'low visibility',
      'severe', 'critical', 'dangerous', 'hazard', 'warning', 'alert',
      'strong wind', 'gust', 'crosswind', 'wind shear', 'microburst',
      'shower', 'rain', 'precipitation', 'storm', 'cyclone', 'hurricane',
      'ceiling', 'cloud', 'overcast', 'broken', 'scattered',
      'notam', 'restriction', 'prohibited', 'closed', 'unserviceable',
      'emergency', 'mayday', 'pan-pan', 'distress', 'incident',
      'fire', 'smoke', 'volcanic ash', 'dust storm', 'sandstorm',
      'freezing', 'frost', 'snow', 'sleet', 'hail', 'ice',
      'runway', 'taxiway', 'apron', 'ramp', 'gate', 'terminal'
    ];
    
    let highlightedText = text;
    criticalWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      highlightedText = highlightedText.replace(regex, `<strong class="font-semibold text-gray-900">${word}</strong>`);
    });
    
    return highlightedText;
  };

  // Function to format section content to match Brief Summary style
  const formatSectionContent = (content: string) => {
    const lines = content.split('\n').filter(line => line.trim());
    const formattedLines = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Remove ** formatting
      const cleanLine = trimmedLine.replace(/\*\*/g, '');
      
      if (cleanLine.startsWith('- ')) {
        // Bullet point matching Brief Summary style with critical word highlighting
        const bulletText = cleanLine.substring(2);
        const highlightedText = highlightCriticalWords(bulletText);
        
        formattedLines.push(
          <div key={formattedLines.length} className="text-sm text-gray-700 py-1">
            <span className="text-gray-500 mr-2">•</span> 
            <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
          </div>
        );
      } else if (cleanLine.match(/^[A-Z][^:]*:$/)) {
        // Bold header matching Brief Summary style
        formattedLines.push(
          <div key={formattedLines.length} className="font-semibold text-gray-800 mt-3 mb-2 text-sm">
            {cleanLine}
          </div>
        );
      } else if (cleanLine.match(/^(LOW|MODERATE|HIGH)\s+RISK/i)) {
        // Risk level badge
        const riskLevel = cleanLine.match(/^(LOW|MODERATE|HIGH)/i)?.[1]?.toUpperCase() || 'LOW';
        formattedLines.push(
          <div key={formattedLines.length} className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-2 ${getRiskBadgeStyling(riskLevel)}`}>
            {cleanLine}
          </div>
        );
      } else if (cleanLine.match(/^(Raw|Decoded|Hazards|Forecast|Analysis|Summary|Actions|Notes|Planning|Sources|Updated|Advisory)/i)) {
        // Subsection headers
        formattedLines.push(
          <div key={formattedLines.length} className="font-medium text-gray-800 mt-2 mb-1 text-sm">
            {cleanLine}
          </div>
        );
      } else if (cleanLine) {
        // Regular text matching Brief Summary style with critical word highlighting
        const highlightedText = highlightCriticalWords(cleanLine);
        formattedLines.push(
          <div key={formattedLines.length} className="text-sm text-gray-700 py-1">
            <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
          </div>
        );
      }
    }
    
    return formattedLines;
  };
  
  // Function to detect risk level from section content
  const getRiskLevel = (content: string): 'LOW' | 'MODERATE' | 'HIGH' | 'NONE' => {
    const lowerContent = content.toLowerCase();
    
    // High risk indicators
    if (lowerContent.includes('critical') || lowerContent.includes('severe') || 
        lowerContent.includes('thunderstorm') || lowerContent.includes('tornado') ||
        lowerContent.includes('icing') || lowerContent.includes('turbulence') ||
        lowerContent.includes('low visibility') || lowerContent.includes('fog') ||
        lowerContent.includes('strong wind') || lowerContent.includes('gust') ||
        lowerContent.includes('high risk')) {
      return 'HIGH';
    }
    
    // Moderate risk indicators
    if (lowerContent.includes('moderate') || lowerContent.includes('shower') ||
        lowerContent.includes('rain') || lowerContent.includes('cloud') ||
        lowerContent.includes('ceiling') || lowerContent.includes('crosswind') ||
        lowerContent.includes('notam') || lowerContent.includes('restriction') ||
        lowerContent.includes('moderate risk')) {
      return 'MODERATE';
    }
    
    // Low risk indicators
    if (lowerContent.includes('clear') || lowerContent.includes('good') ||
        lowerContent.includes('favorable') || lowerContent.includes('no significant') ||
        lowerContent.includes('vfr') || lowerContent.includes('calm') ||
        lowerContent.includes('low risk')) {
      return 'LOW';
    }
    
    return 'NONE';
  };
  
  // Function to get badge styling for risk levels
  const getRiskBadgeStyling = (riskLevel: string) => {
    switch (riskLevel) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 border border-red-300';
      case 'MODERATE':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
      case 'LOW':
        return 'bg-green-100 text-green-800 border border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-300';
    }
  };
  
  
  // If we have an AI-generated detailed report, parse and format it
  if (briefing.detailed_report) {
    const sections = parseAIReport(briefing.detailed_report);
    
    return (
      <div className="space-y-6">
        {sections.map((section, index) => {
          const sectionRiskLevel = getRiskLevel(section.content);
          const isHazardSection = section.title.toLowerCase().includes('hazard') || section.title.toLowerCase().includes('risk');
          
          return (
            <Card key={index} className="bg-white/80 backdrop-blur border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <section.icon className={`w-5 h-5 ${getIconColor(section.title)}`} />
                  {section.title}
                  {/* Warning indicator for hazard sections with risk */}
                  {isHazardSection && (sectionRiskLevel === 'HIGH' || sectionRiskLevel === 'MODERATE') && (
                    <div className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${
                      sectionRiskLevel === 'HIGH' 
                        ? 'bg-red-100 text-red-800 border border-red-300' 
                        : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    }`}>
                      {sectionRiskLevel === 'HIGH' ? '⚠️ HIGH RISK' : '⚠️ MODERATE RISK'}
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 rounded-lg p-4 text-gray-800 leading-relaxed">
                  <div className="space-y-2">
                    {formatSectionContent(section.content)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
  
  // Fallback to basic report if AI report is not available
  return (
    <div className="space-y-6">
      <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Detailed Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-yellow-50 rounded-lg p-4 text-gray-800 leading-relaxed">
            <div className="text-sm">
              <p className="mb-2">⚠️ AI-generated detailed report not available.</p>
              <p className="mb-2">This could be due to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>GEMINI_API_KEY not configured</li>
                <li>API request timeout</li>
                <li>Network connectivity issues</li>
              </ul>
              <p className="mt-2">Please check the backend logs for more details.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FlightDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'brief' | 'detailed'>('brief');

  const [loadingFlight, setLoadingFlight] = useState(true);
  const [flight, setFlight] = useState<any>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");
  const [airportNames, setAirportNames] = useState<
    Record<string, string | null>
  >({});
  const [airportInfoMap, setAirportInfoMap] = useState<
    Record<string, AirportInfo>
  >({});

  const route = useMemo(() => {
    if (!flight) return "";
    const parts = [
      flight.departure,
      ...(flight.intermediates || []),
      flight.arrival,
    ].filter(Boolean);
    return parts.join(" ");
  }, [flight]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingFlight(true);
        if (id) {
          const { data, error } = await supabase
            .from("flights")
            .select("*")
            .eq("id", id)
            .single();
          if (error) throw error;
          setFlight(data);
        } else {
          const routeParam = (search.get("route") || "").trim();
          if (!routeParam) throw new Error("Missing route");
          // Synthesize a temporary flight-like object
          const parts = routeParam.split(/\s+/);
          const dep = parts[0];
          const arr = parts[parts.length - 1];
          const mids = parts.slice(1, -1);
          setFlight({
            id: "route",
            departure: dep,
            arrival: arr,
            intermediates: mids,
            planned_at: null,
          });
        }
      } catch (e) {
        toast({
          title: "Failed to load flight",
          description: e instanceof Error ? e.message : "",
        });
      } finally {
        setLoadingFlight(false);
      }
    };
    if (id || search.get("route")) load();
  }, [id, search]);

  useEffect(() => {
    const loadNames = async () => {
      if (!route) return;
      try {
        const resp = await fetch(
          `http://localhost:8000/airport-info?codes=${encodeURIComponent(
            route
          )}`
        );
        const data = await resp.json();
        const map: Record<string, string | null> = {};
        const infoMap: Record<string, AirportInfo> = {};
        (data || []).forEach((r: AirportInfo) => {
          map[r.icao] = r.name ?? null;
          infoMap[r.icao] = r;
        });
        setAirportNames(map);
        setAirportInfoMap(infoMap);
      } catch {
        // ignore name errors
      }
    };
    loadNames();
  }, [route]);

  const fetchBriefing = async () => {
    if (!route) return;
    try {
      setBriefingLoading(true);
      // reset map shared state
      (window as any).__briefingRoute = [];
      (window as any).__briefingRouteLoaded = false;
      (window as any).__briefingRouteError = undefined;
      const airports = route.trim().split(/\s+/);
      const response = await fetch("http://localhost:8000/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airports }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as any).detail || `HTTP ${response.status}`);
      }
      const data = await response.json();
      // Expose route to map effect without threading through props further
      const routePoints = Array.isArray(data?.route) ? data.route : [];
      (window as any).__briefingRoute = routePoints;
      if (!routePoints.length) {
        (window as any).__briefingRouteError =
          "No OpenSky track found for this route in the recent time window.";
      }
      (window as any).__briefingRouteLoaded = true;
      setBriefing(data);
      setLastRefreshedAt(new Date().toISOString());
      toast({ title: "Refreshed", description: "Latest briefing loaded" });
    } catch (e) {
      toast({
        title: "Briefing failed",
        description: e instanceof Error ? e.message : "",
      });
      // surface error on map
      (window as any).__briefingRouteError =
        e instanceof Error ? e.message : "Route fetch failed";
      (window as any).__briefingRouteLoaded = true;
    } finally {
      setBriefingLoading(false);
    }
  };

  useEffect(() => {
    if (route) {
      fetchBriefing();
    }
  }, [route]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="text-sm text-gray-600">
            {flight?.planned_at && new Date(flight.planned_at).toLocaleString()}
          </div>
        </div>

        <Card className="bg-white/80 backdrop-blur border-0 shadow-lg mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plane className="w-5 h-5 text-blue-600" />
              {loadingFlight
                ? "Loading flight..."
                : `${flight?.departure} → ${(flight?.intermediates || []).join(
                    " "
                  )} ${flight?.arrival}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Names Row */}
            {!loadingFlight && (
              <div className="text-sm text-gray-700 mb-3">
                {[
                  flight?.departure,
                  ...(flight?.intermediates || []),
                  flight?.arrival,
                ]
                  .filter(Boolean)
                  .map((code: string, idx: number, arr: string[]) => (
                    <span key={idx}>
                      <span className="font-medium">
                        {airportNames[code] || ""}
                      </span>
                      {idx < arr.length - 1 && <span className="mx-2">→</span>}
                    </span>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {lastRefreshedAt && (
                  <>
                    Last refreshed at{" "}
                    {new Date(lastRefreshedAt).toLocaleString()}
                  </>
                )}
              </div>
              <Button
                onClick={fetchBriefing}
                disabled={briefingLoading || !route}
                className="gap-2"
              >
                <RefreshCw
                  className={`w-4 h-4 ${briefingLoading ? "animate-spin" : ""}`}
                />
                {briefingLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {briefingLoading && (
          <div className="mb-6 text-gray-600">
            Fetching latest weather and recalculating summary...
          </div>
        )}
        {!briefingLoading && !briefing && (
          <div className="mb-6 text-amber-700">
            No briefing yet. Click Refresh to fetch.
          </div>
        )}

        {briefing && (
          <div className="grid gap-6">
            {/* Tab Navigation */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('brief')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'brief'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                Brief Summary
              </button>
              <button
                onClick={() => setActiveTab('detailed')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'detailed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Detailed Report
              </button>
            </div>
            
            {/* Tab Content */}
            {activeTab === 'brief' && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Flight Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-blue-50 rounded-lg p-4 text-gray-800 leading-relaxed">
                    {(() => {
                      const lines = (briefing.summary_5line || "")
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter((l) => l.length > 0);
                      if (lines.length <= 1) {
                        return (
                          <p className="whitespace-pre-line">
                            {briefing.summary_5line}
                          </p>
                        );
                      }
                      return (
                        <ul className="list-disc pl-5 space-y-1">
                          {lines.map((l, i) => (
                            <li key={i}>{l.replace(/^([*\-•]\s*)/, "")}</li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {activeTab === 'detailed' && (
              <DetailedReport 
                briefing={briefing} 
                flight={flight} 
                airportInfoMap={airportInfoMap} 
              />
            )}

            {/* Inline Route Map under summary */}
            <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Route Map</CardTitle>
              </CardHeader>
              <CardContent>
                <RouteMap
                  routeCodes={[
                    flight?.departure,
                    ...(flight?.intermediates || []),
                    flight?.arrival,
                  ].filter(Boolean)}
                  airportInfoMap={airportInfoMap}
                  metars={briefing.metars || []}
                  briefing={briefing}
                />
              </CardContent>
            </Card>

            {briefing.metars && briefing.metars.length > 0 && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plane className="w-5 h-5 text-blue-600" /> Current Weather
                    (METARs)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {briefing.metars.map((m, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-4">
                        <div className="font-semibold text-blue-600 mb-1">
                          {m.station}
                        </div>
                        <div className="text-sm text-gray-700 font-mono">
                          {m.raw_text}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {briefing.alternates && briefing.alternates.length > 0 && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="w-5 h-5 text-green-600" /> Alternate
                    Airports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {"alternate_categories_single" in briefing &&
                  (briefing as any).alternate_categories_single ? (
                    <div className="grid md:grid-cols-3 gap-4">
                      {[
                        {
                          key: "best_fuel_efficiency",
                          label: "Best Fuel Efficiency",
                        },
                        { key: "least_deviation", label: "Least Deviation" },
                        { key: "safest", label: "Safest for Emergencies" },
                      ].map((cat) => {
                        const a = (briefing as any).alternate_categories_single[
                          cat.key
                        ];
                        const colorMap: Record<
                          string,
                          {
                            bg: string;
                            icon: string;
                            code: string;
                            name: string;
                          }
                        > = {
                          best_fuel_efficiency: {
                            bg: "bg-yellow-50",
                            icon: "text-yellow-600",
                            code: "text-yellow-800",
                            name: "text-yellow-700",
                          },
                          least_deviation: {
                            bg: "bg-green-100",
                            icon: "text-green-800",
                            code: "text-green-900",
                            name: "text-green-800",
                          },
                          safest: {
                            bg: "bg-red-50",
                            icon: "text-red-600",
                            code: "text-red-800",
                            name: "text-red-700",
                          },
                        };
                        const styles = colorMap[cat.key] ?? {
                          bg: "bg-green-50",
                          icon: "text-green-600",
                          code: "text-green-800",
                          name: "text-green-700",
                        };
                        return (
                          <div key={cat.key}>
                            <h4 className="font-semibold text-gray-800 mb-2">
                              {cat.label}
                            </h4>
                            {a ? (
                              <div
                                className={`flex items-center gap-2 p-3 ${styles.bg} rounded-lg`}
                              >
                                <MapPin
                                  className={`w-4 h-4 ${styles.icon} flex-shrink-0`}
                                />
                                <div>
                                  <span
                                    className={`font-semibold ${styles.code}`}
                                  >
                                    {a.icao}
                                  </span>
                                  <span
                                    className={`text-sm ml-2 ${styles.name}`}
                                  >
                                    {a.name}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">
                                No suggestion
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {briefing.alternates.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                        >
                          <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-green-800">
                              {a.icao}
                            </span>
                            <span className="text-sm text-green-700 ml-2">
                              {a.name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

