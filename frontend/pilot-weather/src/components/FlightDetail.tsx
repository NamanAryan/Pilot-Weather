import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import planeLoadingGif from "../assets/plane-loading.gif";
import {
  ArrowLeft,
  RefreshCw,
  Plane,
  MapPin,
  FileText,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
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
    least_deviation?: {
      icao: string;
      name?: string | null;
      lat?: number;
      lon?: number;
      runway_length?: number;
      has_fuel?: boolean;
      has_customs?: boolean;
    } | null;
    best_fuel_efficiency?: {
      icao: string;
      name?: string | null;
      lat?: number;
      lon?: number;
      runway_length?: number;
      has_fuel?: boolean;
      has_customs?: boolean;
    } | null;
    safest?: {
      icao: string;
      name?: string | null;
      lat?: number;
      lon?: number;
      runway_length?: number;
      has_fuel?: boolean;
      has_customs?: boolean;
    } | null;
  };
  route?: Array<{
    lat: number;
    lon: number;
    altitude: number;
  }>;
  fatigue_warning?: boolean;
  fatigue_reason?: string;
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
  
  // More comprehensive thunderstorm detection
  const thunderstormIndicators = [
    "TS",           // Thunderstorm
    "THUNDERSTORM", // Full word
    "TEMPO",        // Temporary conditions
    "TSRA",         // Thunderstorm with rain
    "TSSN",         // Thunderstorm with snow
    "TSGR",         // Thunderstorm with hail
    "TSGS",         // Thunderstorm with small hail
    "CB",           // Cumulonimbus clouds
    "TCU",          // Towering cumulus
    "FC",           // Funnel cloud
    "TORNADO",      // Tornado
    "WATERSPOUT"    // Waterspout
  ];
  
  const hasThunderstorm = thunderstormIndicators.some(indicator => 
    rawText.includes(indicator)
  );
  
  console.log(`Thunderstorm check for ${metar.station}:`, {
    rawText,
    hasThunderstorm,
    indicators: thunderstormIndicators.filter(indicator => rawText.includes(indicator))
  });
  
  return hasThunderstorm;
}

// Function to generate thunderstorm polygon coordinates around an airport
function generateThunderstormPolygon(
  lat: number,
  lon: number,
  radiusKm: number = 25
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const numPoints = 12; // Number of points to create a circular polygon

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 360) / numPoints;
    const radians = (angle * Math.PI) / 180;

    // Convert km to degrees (approximate)
    const latOffset = (radiusKm / 111) * Math.cos(radians);
    const lonOffset =
      (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(radians);

    points.push([lat + latOffset, lon + lonOffset]);
  }

  return points;
}

// Function to extract airport-specific summary from AI-generated briefing
function getAirportSpecificSummary(
  airportCode: string,
  aiSummary: string,
  metar: Metar
): string {
  if (!aiSummary) {
    return metar ? summarizeMetar(metar) : "No weather data available";
  }

  // Try to find airport-specific information in the AI summary
  const lines = aiSummary.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    // Look for lines that mention the specific airport
    if (line.toLowerCase().includes(airportCode.toLowerCase())) {
      return line.trim();
    }

    // Look for lines that mention airport names (common patterns)
    const airportNamePatterns = {
      VABB: ["mumbai", "bombay"],
      VEBS: ["bhubaneswar", "bhubaneshwar"],
      VOBL: ["bangalore", "bengaluru", "bangaluru"],
      VASU: ["surat"],
      VIDP: ["delhi", "new delhi"],
      VECC: ["kolkata", "calcutta"],
      VOMM: ["chennai", "madras"],
      VAGO: ["goa"],
      VAPO: ["pune"],
    };

    const patterns =
      airportNamePatterns[airportCode as keyof typeof airportNamePatterns] ||
      [];
    for (const pattern of patterns) {
      if (line.toLowerCase().includes(pattern)) {
        return line.trim();
      }
    }
  }

  // If no airport-specific line found, try to extract relevant weather info
  // Look for weather conditions that might apply to this airport
  const weatherKeywords = [
    "wind",
    "visibility",
    "cloud",
    "temperature",
    "rain",
    "fog",
    "clear",
  ];
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
          const hoverSummary = metar ? metar.raw_text : "No METAR";

          // Extract airport-specific summary from AI-generated briefing
          const clickSummary = getAirportSpecificSummary(
            code,
            briefing.summary_5line,
            metar
          );

          // Check for thunderstorms and add red polygon if present
          console.log(`Checking thunderstorm for ${code}:`, {
            metar: metar,
            raw_text: metar?.raw_text,
            hasThunderstorm: metar ? hasThunderstorm(metar) : false
          });
          if (metar && hasThunderstorm(metar)) {
            const thunderstormPolygon = generateThunderstormPolygon(
              info.latitude_deg,
              info.longitude_deg,
              25 // 25km radius
            );

            const polygon = L.polygon(thunderstormPolygon, {
              color: "#dc2626", // Red color
              weight: 2,
              opacity: 0.8,
              fillColor: "#dc2626",
              fillOpacity: 0.3,
            });

            polygon.bindTooltip(`⚠️ Thunderstorm Activity at ${code}`, {
              direction: "center",
              className: "thunderstorm-tooltip",
              permanent: false,
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
            maxWidth: 400,
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
  airportInfoMap: _airportInfoMap,
}: {
  briefing: Briefing;
  flight: any;
  airportInfoMap: Record<string, AirportInfo>;
}) {
  // Debug logging to see what data we're actually getting
  console.log("DetailedReport Debug:", {
    metars: briefing.metars?.length || 0,
    tafs: briefing.tafs?.length || 0,
    notams: briefing.notams?.length || 0,
    pireps: briefing.pireps?.length || 0,
    hazards: briefing.hazards?.length || 0,
    route: briefing.route?.length || 0,
    alternates: briefing.alternates?.length || 0,
    hasDetailedReport: !!briefing.detailed_report,
  });

  // Function to parse AI report and format it into sections
  const parseAIReport = (report: string) => {
    const sections = [];
    const lines = report.split("\n");
    let currentSection = { title: "", content: "", icon: Briefcase };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for section headers
      if (line.match(/^\d+\.\s+(.+)/)) {
        // Save previous section if it exists
        if (currentSection.title) {
          sections.push({ ...currentSection });
        }

        // Start new section
        const title = line.replace(/^\d+\.\s+/, "");
        currentSection = {
          title,
          content: "",
          icon: getIconForSection(title),
        };
      } else if (
        line &&
        !line.startsWith("===") &&
        !line.startsWith("IMPORTANT:")
      ) {
        // Add content to current section
        if (currentSection.content) {
          currentSection.content += "\n" + line;
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
    if (
      lowerTitle.includes("flight overview") ||
      lowerTitle.includes("overview")
    )
      return Briefcase;
    if (lowerTitle.includes("departure")) return Plane;
    if (lowerTitle.includes("enroute") || lowerTitle.includes("segment"))
      return MapPin;
    if (lowerTitle.includes("destination") || lowerTitle.includes("arrival"))
      return Plane;
    if (lowerTitle.includes("alternate")) return MapPin;
    if (lowerTitle.includes("hazard") || lowerTitle.includes("risk"))
      return AlertTriangle;
    if (lowerTitle.includes("operational") || lowerTitle.includes("notes"))
      return FileText;
    return Briefcase;
  };

  // Function to get color for section icon
  const getIconColor = (title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("departure")) return "text-green-600";
    if (lowerTitle.includes("enroute") || lowerTitle.includes("segment"))
      return "text-orange-600";
    if (lowerTitle.includes("destination") || lowerTitle.includes("arrival"))
      return "text-red-600";
    if (lowerTitle.includes("alternate")) return "text-purple-600";
    if (lowerTitle.includes("hazard") || lowerTitle.includes("risk"))
      return "text-red-600";
    if (lowerTitle.includes("operational") || lowerTitle.includes("notes"))
      return "text-gray-600";
    return "text-gray-600";
  };

  // Function to highlight critical words in text
  const highlightCriticalWords = (text: string) => {
    const criticalWords = [
      "risk",
      "thunderstorm",
      "turbulence",
      "icing",
      "fog",
      "low visibility",
      "severe",
      "critical",
      "dangerous",
      "hazard",
      "warning",
      "alert",
      "strong wind",
      "gust",
      "crosswind",
      "wind shear",
      "microburst",
      "shower",
      "rain",
      "precipitation",
      "storm",
      "cyclone",
      "hurricane",
      "ceiling",
      "cloud",
      "overcast",
      "broken",
      "scattered",
      "notam",
      "restriction",
      "prohibited",
      "closed",
      "unserviceable",
      "emergency",
      "mayday",
      "pan-pan",
      "distress",
      "incident",
      "fire",
      "smoke",
      "volcanic ash",
      "dust storm",
      "sandstorm",
      "freezing",
      "frost",
      "snow",
      "sleet",
      "hail",
      "ice",
      "runway",
      "taxiway",
      "apron",
      "ramp",
      "gate",
      "terminal",
    ];

    let highlightedText = text;
    criticalWords.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      highlightedText = highlightedText.replace(
        regex,
        `<strong class="font-semibold text-gray-900">${word}</strong>`
      );
    });

    return highlightedText;
  };

  // Function to format section content to match Brief Summary style
  const formatSectionContent = (content: string) => {
    const lines = content.split("\n").filter((line) => line.trim());
    const formattedLines = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Remove ** formatting
      const cleanLine = trimmedLine.replace(/\*\*/g, "");

      if (cleanLine.startsWith("- ")) {
        // Bullet point matching Brief Summary style with critical word highlighting
        const bulletText = cleanLine.substring(2);
        const highlightedText = highlightCriticalWords(bulletText);

        formattedLines.push(
          <div
            key={formattedLines.length}
            className="text-sm text-gray-700 py-1"
          >
            <span className="text-gray-500 mr-2">•</span>
            <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
          </div>
        );
      } else if (cleanLine.match(/^[A-Z][^:]*:$/)) {
        // Bold header matching Brief Summary style
        formattedLines.push(
          <div
            key={formattedLines.length}
            className="font-semibold text-gray-800 mt-3 mb-2 text-sm"
          >
            {cleanLine}
          </div>
        );
      } else if (cleanLine.match(/^(LOW|MODERATE|HIGH)\s+RISK/i)) {
        // Risk level badge
        const riskLevel =
          cleanLine.match(/^(LOW|MODERATE|HIGH)/i)?.[1]?.toUpperCase() || "LOW";
        formattedLines.push(
          <div
            key={formattedLines.length}
            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-2 ${getRiskBadgeStyling(
              riskLevel
            )}`}
          >
            {cleanLine}
          </div>
        );
      } else if (
        cleanLine.match(
          /^(Raw|Decoded|Hazards|Forecast|Analysis|Summary|Actions|Notes|Planning|Sources|Updated|Advisory)/i
        )
      ) {
        // Subsection headers
        formattedLines.push(
          <div
            key={formattedLines.length}
            className="font-medium text-gray-800 mt-2 mb-1 text-sm"
          >
            {cleanLine}
          </div>
        );
      } else if (cleanLine) {
        // Regular text matching Brief Summary style with critical word highlighting
        const highlightedText = highlightCriticalWords(cleanLine);
        formattedLines.push(
          <div
            key={formattedLines.length}
            className="text-sm text-gray-700 py-1"
          >
            <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
          </div>
        );
      }
    }

    return formattedLines;
  };

  // Function to detect risk level from section content
  const getRiskLevel = (
    content: string
  ): "LOW" | "MODERATE" | "HIGH" | "NONE" => {
    const lowerContent = content.toLowerCase();

    // First check for explicit risk level mentions (highest priority)
    if (
      lowerContent.includes("high risk") ||
      lowerContent.includes("**high risk**")
    ) {
      return "HIGH";
    }
    if (
      lowerContent.includes("moderate risk") ||
      lowerContent.includes("**moderate risk**")
    ) {
      return "MODERATE";
    }
    if (
      lowerContent.includes("low risk") ||
      lowerContent.includes("**low risk**")
    ) {
      return "LOW";
    }

    // High risk indicators (only if no explicit risk level mentioned)
    if (
      lowerContent.includes("critical") ||
      lowerContent.includes("severe") ||
      lowerContent.includes("thunderstorm") ||
      lowerContent.includes("tornado") ||
      lowerContent.includes("icing") ||
      lowerContent.includes("turbulence") ||
      lowerContent.includes("low visibility") ||
      lowerContent.includes("fog") ||
      lowerContent.includes("strong wind") ||
      lowerContent.includes("gust")
    ) {
      return "HIGH";
    }

    // Moderate risk indicators (only if no explicit risk level mentioned)
    if (
      lowerContent.includes("shower") ||
      lowerContent.includes("rain") ||
      lowerContent.includes("cloud") ||
      lowerContent.includes("ceiling") ||
      lowerContent.includes("crosswind") ||
      lowerContent.includes("notam") ||
      lowerContent.includes("restriction")
    ) {
      return "MODERATE";
    }

    // Low risk indicators (only if no explicit risk level mentioned)
    if (
      lowerContent.includes("clear") ||
      lowerContent.includes("good") ||
      lowerContent.includes("favorable") ||
      lowerContent.includes("no significant") ||
      lowerContent.includes("vfr") ||
      lowerContent.includes("calm")
    ) {
      return "LOW";
    }

    return "NONE";
  };

  // Function to get badge styling for risk levels
  const getRiskBadgeStyling = (riskLevel: string) => {
    switch (riskLevel) {
      case "HIGH":
        return "bg-red-50 text-red-700 border border-red-200 shadow-sm";
      case "MODERATE":
        return "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm";
      case "LOW":
        return "bg-green-50 text-green-700 border border-green-200 shadow-sm";
      default:
        return "bg-gray-800 text-white border border-gray-700 shadow-sm";
    }
  };

  // If we have an AI-generated detailed report, parse and format it
  if (briefing.detailed_report) {
    const sections = parseAIReport(briefing.detailed_report);

    return (
      <div className="space-y-6">
        {sections.map((section, index) => {
          const sectionRiskLevel = getRiskLevel(section.content);
          const isHazardSection =
            section.title.toLowerCase().includes("hazard") ||
            section.title.toLowerCase().includes("risk");

          return (
            <Card
              key={index}
              className="bg-white/80 backdrop-blur border-0 shadow-lg"
            >
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <section.icon
                    className={`w-5 h-5 ${getIconColor(section.title)}`}
                  />
                  {section.title}
                  {/* Warning indicator for hazard sections with risk */}
                  {isHazardSection &&
                    (sectionRiskLevel === "HIGH" ||
                      sectionRiskLevel === "MODERATE") && (
                      <div
                        className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${
                          sectionRiskLevel === "HIGH"
                            ? "bg-red-50 text-red-700 border border-red-200 shadow-sm"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-200 shadow-sm"
                        }`}
                      >
                        {sectionRiskLevel === "HIGH"
                          ? "⚠️ HIGH RISK"
                          : "⚠️ MODERATE RISK"}
                      </div>
                    )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-4 text-gray-800 leading-relaxed">
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
            <Briefcase className="w-5 h-5 text-gray-600" />
            Detailed Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-yellow-50 rounded-lg p-4 text-yellow-800 leading-relaxed border border-yellow-200 shadow-sm">
            <div className="text-sm">
              <p className="mb-2">
                ⚠️ AI-generated detailed report not available.
              </p>
              <p className="mb-2">This could be due to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>GEMINI_API_KEY not configured</li>
                <li>API request timeout</li>
                <li>Network connectivity issues</li>
              </ul>
              <p className="mt-2">
                Please check the backend logs for more details.
              </p>
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
  const [activeTab, setActiveTab] = useState<"brief" | "detailed">("brief");

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

  // Function to detect fatigue warnings for flights within 48 hours
  const detectFatigueWarning = async (flightId: string) => {
    if (!flightId || flightId === "route") return null;

    try {
      // Get all upcoming flights for the user
      const { data: flights, error } = await supabase
        .from("flights")
        .select("*")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .not("planned_at", "is", null)
        .gt("planned_at", new Date().toISOString())
        .order("planned_at", { ascending: true });

      if (error || !flights) return null;

      // Find the current flight
      const currentFlight = flights.find(f => f.id === flightId);
      if (!currentFlight || !currentFlight.planned_at) return null;

      // Check if there's a previous flight within 48 hours
      const currentTime = new Date(currentFlight.planned_at).getTime();
      
      for (const otherFlight of flights) {
        if (otherFlight.id === flightId || !otherFlight.planned_at) continue;
        
        const otherTime = new Date(otherFlight.planned_at).getTime();
        const timeDifference = Math.abs(currentTime - otherTime);
        const hoursDifference = timeDifference / (1000 * 60 * 60);

        if (hoursDifference <= 48) {
          return {
            fatigue_warning: true,
            fatigue_reason: `Flight scheduled within 48 hours of another flight (${Math.round(hoursDifference)} hours apart)`
          };
        }
      }

      return null;
    } catch (error) {
      console.error("Error detecting fatigue warning:", error);
      return null;
    }
  };

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
          `https://pilot-weather-frontend.vercel.app/airport-info?codes=${encodeURIComponent(
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
      const response = await fetch("https://pilot-weather-frontend.vercel.app/analyze-route", {
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
      
      // Add fatigue warning if this is a saved flight
      let briefingWithFatigue = data;
      if (id && id !== "route") {
        const fatigueWarning = await detectFatigueWarning(id);
        if (fatigueWarning) {
          briefingWithFatigue = {
            ...data,
            fatigue_warning: fatigueWarning.fatigue_warning,
            fatigue_reason: fatigueWarning.fatigue_reason
          };
        }
      }
      
      setBriefing(briefingWithFatigue);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2 px-6 py-2 rounded-xl border-slate-200 hover:bg-gray-800 hover:text-white hover:border-gray-800 hover-lift btn-press"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="text-sm text-slate-600 bg-white px-4 py-2 rounded-xl shadow-sm">
            {flight?.planned_at && new Date(flight.planned_at).toLocaleString()}
          </div>
        </div>

        <Card className="bg-white rounded-3xl border-0 shadow-xl mb-8 card-hover">
          <CardHeader className="pb-6">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center">
                <Plane className="w-5 h-5 text-gray-600" />
              </div>
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
              <div className="text-sm text-slate-600 mb-4 bg-slate-50 rounded-xl p-3">
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
          <div className="mb-6 flex flex-col items-center justify-center">
            <div className="mb-4">
              <div className="gif-loading-container">
                <img
                  src={planeLoadingGif}
                  alt="Loading weather data..."
                  className="loading-gif"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    filter: 'none'
                  }}
                />
              </div>
            </div>
            <div className="text-gray-600 text-center">
              Fetching latest weather and recalculating summary...
            </div>
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
                onClick={() => setActiveTab("brief")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover-lift btn-press ${
                  activeTab === "brief"
                    ? "bg-gray-800 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <FileText className="w-4 h-4" />
                Brief Summary
              </button>
              <button
                onClick={() => setActiveTab("detailed")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover-lift btn-press ${
                  activeTab === "detailed"
                    ? "bg-gray-800 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Detailed Report
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "brief" && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg card-hover">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Flight Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-4 text-gray-800 leading-relaxed">
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

            {/* Fatigue Warning */}
            {briefing.fatigue_warning && (
              <Card className="bg-red-50 border-red-300 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl flex items-center gap-3 text-red-900 font-bold">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                    Pilot Fatigue Risk Alert
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-2xl p-6 border-2 border-red-200 shadow-inner">
                    <div className="space-y-4">
                      <div className="bg-red-600 text-white rounded-xl p-4 text-center">
                        <p className="text-lg font-bold mb-1">
                          ⚠️ FATIGUE WARNING DETECTED
                        </p>
                        <p className="text-sm opacity-90">
                          This flight may pose a fatigue risk
                        </p>
                      </div>
                      
                      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <p className="text-red-800 font-semibold text-base mb-2">
                          Schedule Conflict Details:
                        </p>
                        <p className="text-red-700 text-sm leading-relaxed bg-white rounded-lg p-3 border border-red-100">
                          {briefing.fatigue_reason}
                        </p>
                      </div>
                      
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                        <p className="text-amber-800 font-semibold text-sm mb-2">
                          💡 Safety Recommendation:
                        </p>
                        <p className="text-amber-700 text-sm leading-relaxed">
                          Consider rescheduling this flight or ensuring adequate rest periods between flights. 
                          Fatigue can significantly impact flight safety and decision-making abilities.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "detailed" && (
              <DetailedReport
                briefing={briefing}
                flight={flight}
                airportInfoMap={airportInfoMap}
              />
            )}

            {/* Inline Route Map under summary */}
            <Card className="bg-white/80 backdrop-blur border-0 shadow-lg card-hover">
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
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg card-hover">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plane className="w-5 h-5 text-gray-600" /> Current Weather
                    (METARs)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {briefing.metars.map((m, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-4">
                        <div className="font-semibold text-gray-600 mb-1">
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

            {/* Alternate Airports Section */}
            {briefing.alternate_categories_single && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg card-hover">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-purple-600" />
                    Alternate Airports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Least Deviation */}
                    {briefing.alternate_categories_single.least_deviation && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Least Deviation
                        </h4>
                        <div className="space-y-1">
                          <div className="text-sm text-blue-700">
                            <span className="font-medium">
                              {briefing.alternate_categories_single.least_deviation.icao}
                            </span>
                            {briefing.alternate_categories_single.least_deviation.name && (
                              <span className="ml-2 text-blue-600">
                                - {briefing.alternate_categories_single.least_deviation.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Best Fuel Efficiency */}
                    {briefing.alternate_categories_single.best_fuel_efficiency && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Best Fuel Efficiency
                        </h4>
                        <div className="space-y-1">
                          <div className="text-sm text-green-700">
                            <span className="font-medium">
                              {briefing.alternate_categories_single.best_fuel_efficiency.icao}
                            </span>
                            {briefing.alternate_categories_single.best_fuel_efficiency.name && (
                              <span className="ml-2 text-green-600">
                                - {briefing.alternate_categories_single.best_fuel_efficiency.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Safest */}
                    {briefing.alternate_categories_single.safest && (
                      <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                        <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Safest
                        </h4>
                        <div className="space-y-1">
                          <div className="text-sm text-red-700">
                            <span className="font-medium">
                              {briefing.alternate_categories_single.safest.icao}
                            </span>
                            {briefing.alternate_categories_single.safest.name && (
                              <span className="ml-2 text-red-600">
                                - {briefing.alternate_categories_single.safest.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
