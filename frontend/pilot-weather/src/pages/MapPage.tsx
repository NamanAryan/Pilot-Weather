import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type AirportInfo = {
  icao: string;
  name?: string | null;
  latitude_deg?: number | null;
  longitude_deg?: number | null;
};

type Metar = { station: string; raw_text: string };

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

declare global {
  interface Window {
    L: any;
  }
}

const leafletCSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const clusterJS =
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
const clusterCSS =
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
const clusterBaseCSS =
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";

function useScript(src: string) {
  useEffect(() => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.body.appendChild(s);
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
    document.head.appendChild(l);
    return () => {
      l.remove();
    };
  }, [href]);
}

export default function MapPage() {
  const [search] = useSearchParams();
  const [airports, setAirports] = useState<AirportInfo[]>([]);
  const [metars, setMetars] = useState<Record<string, Metar | undefined>>({});

  // Load Leaflet and cluster resources
  useStyle(leafletCSS);
  useStyle(clusterBaseCSS);
  useStyle(clusterCSS);
  useScript(leafletJS);
  useScript(clusterJS);

  const route = useMemo(() => (search.get("route") || "").trim(), [search]);

  useEffect(() => {
    const codes = route || "";
    if (!codes) return;
    (async () => {
      const resp = await fetch(
        `http://localhost:8000/airport-info?codes=${encodeURIComponent(codes)}`
      );
      const list: AirportInfo[] = await resp.json();
      setAirports(list.filter((a) => a.latitude_deg && a.longitude_deg));

      // Fetch METARs in parallel using existing backend analyze for raw parsing
      try {
        const arr = codes.split(/\s+/).filter(Boolean);
        const res = await fetch("http://localhost:8000/analyze-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ airports: arr }),
        });
        const data = await res.json();
        const map: Record<string, Metar> = {};
        (data.metars || []).forEach((m: Metar) => {
          map[m.station] = m;
        });
        setMetars(map);
      } catch {
        // ignore
      }
    })();
  }, [route]);

  useEffect(() => {
    if (!window.L) return;
    const L = window.L;
    const map = L.map("airport-map", { center: [22.9734, 78.6569], zoom: 5 }); // India center
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Cluster group
    const markers = (L as any).markerClusterGroup
      ? (L as any).markerClusterGroup()
      : null;

    airports.forEach((a) => {
      const metar = metars[a.icao];
      const summary = metar
        ? metar.raw_text.split(" ").slice(0, 6).join(" ")
        : "No METAR";
      const color = metar
        ? metar.raw_text.includes("TEMPO") || metar.raw_text.includes("TS")
          ? "red"
          : "green"
        : "gray";
      const icon = L.divIcon({
        className: "",
        html: `<div style=\"background:${color};color:white;border-radius:50%;width:14px;height:14px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.3)\"></div>`,
        iconSize: [14, 14],
      });

      // Check for thunderstorms and add red polygon if present
      if (metar && hasThunderstorm(metar)) {
        const thunderstormPolygon = generateThunderstormPolygon(
          a.latitude_deg!, 
          a.longitude_deg!, 
          25 // 25km radius
        );
        
        const polygon = L.polygon(thunderstormPolygon, {
          color: '#dc2626', // Red color
          weight: 2,
          opacity: 0.8,
          fillColor: '#dc2626',
          fillOpacity: 0.3
        });
        
        polygon.bindTooltip(`⚠️ Thunderstorm Activity at ${a.icao}`, {
          direction: "center",
          className: "thunderstorm-tooltip",
          permanent: false
        });
        
        polygon.bindPopup(
          `
          <div style="font-family: Arial, sans-serif; max-width: 300px;">
            <h3 style="margin: 0 0 8px 0; color: #dc2626; font-size: 16px;">⚠️ Thunderstorm Warning</h3>
            <p style="margin: 0; color: #374151; line-height: 1.4;"><strong>${a.icao}</strong></p>
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

      const m = L.marker([a.latitude_deg!, a.longitude_deg!], { icon });
      m.bindPopup(`
        <div style="min-width:220px">
          <div style="font-weight:700;color:#1f2937">${a.icao}</div>
          <div style="color:#374151;font-size:12px">${a.name ?? ""}</div>
          <div style="margin-top:6px;font-size:12px;color:#111827">${summary}</div>
        </div>
      `);
      m.bindTooltip(`${a.icao}: ${summary}`, { direction: "top" });
      if (markers) markers.addLayer(m);
      else m.addTo(map);
    });

    if (markers) markers.addTo(map);

    // Draw route line connecting airports
    if (airports.length >= 2) {
      const routeCoords = airports.map((a) => [a.latitude_deg!, a.longitude_deg!]);
      L.polyline(routeCoords, { color: "#ec4899", weight: 3 }).addTo(map);
    }

    if (airports.length > 0) {
      const group = L.featureGroup(
        airports.map((a) => L.marker([a.latitude_deg!, a.longitude_deg!]))
      );
      map.fitBounds(group.getBounds().pad(0.2));
    }

    // Add custom CSS for thunderstorm styling
    const style = document.createElement("style");
    style.textContent = `
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

    return () => {
      map.remove();
    };
  }, [airports, metars]);

  const example = "VABB VAAH VAID VAPO";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-700 transition-colors bg-white px-4 py-2 rounded-xl shadow-sm hover-lift btn-press"
          >
            ← Back
          </Link>
          <div className="text-sm text-slate-600 bg-white px-4 py-2 rounded-xl shadow-sm">Map View</div>
        </div>

        <div className="bg-white rounded-3xl border-0 shadow-xl p-6 card-hover">
          <div className="text-sm text-slate-600 mb-4">
            Provide your route in the URL as <code className="bg-slate-100 px-2 py-1 rounded-lg font-mono">?route=KJFK EGLL LFPG</code>.
            Example:{" "}
            <Link
              className="text-gray-600 hover:text-gray-700 transition-colors font-medium link-hover"
              to={`/map?route=${encodeURIComponent(example)}`}
            >
              {example}
            </Link>
          </div>
          <div id="airport-map" style={{ height: 600, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}
