import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { ArrowLeft, RefreshCw, Plane, MapPin } from "lucide-react";

interface Briefing {
  summary_5line: string;
  metars?: Array<{ station: string; raw_text: string }>;
  hazards?: string[];
  alternates?: Array<{ icao: string; name?: string | null }>;
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

function RouteMap({
  routeCodes,
  airportInfoMap,
  metars,
}: {
  routeCodes: string[];
  airportInfoMap: Record<string, AirportInfo>;
  metars: Metar[];
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
            ? metar.raw_text.split(" ").slice(0, 6).join(" ")
            : "No METAR";
          const clickSummary = metar
            ? summarizeMetar(metar)
            : "No weather data available";

          const marker = L.marker([info.latitude_deg, info.longitude_deg]);

          // Tooltip on hover (short METAR)
          marker.bindTooltip(`${code}: ${hoverSummary}`, { direction: "top" });

          // Popup on click (summarized METAR)
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

        // Prefer backend-provided route geometry
        const realRoute: Array<{
          lat: number;
          lon: number;
          altitude?: number;
        }> = (window as any).__briefingRoute || [];
        if (Array.isArray(realRoute) && realRoute.length >= 2) {
          const rcoords = realRoute.map((p) => [p.lat, p.lon]);
          L.polyline(rcoords, { color: "#ec4899", weight: 3 }).addTo(map);
          const group = L.featureGroup(rcoords.map((c) => L.marker(c)));
          map.fitBounds(group.getBounds().pad(0.2));
        } else if (coords.length >= 2) {
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

export default function FlightDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

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
