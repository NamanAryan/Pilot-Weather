import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";

type AirportInfo = {
  icao: string;
  name?: string | null;
  latitude_deg?: number | null;
  longitude_deg?: number | null;
};

type Metar = { station: string; raw_text: string };

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

    if (airports.length > 0) {
      const group = L.featureGroup(
        airports.map((a) => L.marker([a.latitude_deg!, a.longitude_deg!]))
      );
      map.fitBounds(group.getBounds().pad(0.2));
    }

    return () => {
      map.remove();
    };
  }, [airports, metars]);

  const example = "VABB VAAH VAID VAPO";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-blue-600 underline">
            ← Back
          </Link>
          <div className="text-sm text-gray-600">Map View</div>
        </div>

        <div className="bg-white/80 backdrop-blur border-0 shadow-lg rounded-xl p-4">
          <div className="text-sm text-gray-700 mb-2">
            Provide your route in the URL as <code>?route=KJFK EGLL LFPG</code>.
            Example:{" "}
            <Link
              className="text-blue-600 underline"
              to={`/map?route=${encodeURIComponent(example)}`}
            >
              {example}
            </Link>
          </div>
          <div id="airport-map" style={{ height: 600, borderRadius: 12 }} />
        </div>
      </div>
    </div>
  );
}
