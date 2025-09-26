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
  const [airportNames, setAirportNames] = useState<Record<string, string | null>>({});

  const route = useMemo(() => {
    if (!flight) return "";
    const parts = [flight.departure, ...(flight.intermediates || []), flight.arrival]
      .filter(Boolean);
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
          setFlight({ id: "route", departure: dep, arrival: arr, intermediates: mids, planned_at: null });
        }
      } catch (e) {
        toast({ title: "Failed to load flight", description: e instanceof Error ? e.message : "" });
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
        const resp = await fetch(`http://localhost:8000/airport-info?codes=${encodeURIComponent(route)}`);
        const data = await resp.json();
        const map: Record<string, string | null> = {};
        (data || []).forEach((r: any) => { map[r.icao] = r.name ?? null; });
        setAirportNames(map);
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
      setBriefing(data);
      setLastRefreshedAt(new Date().toISOString());
      toast({ title: "Refreshed", description: "Latest briefing loaded" });
    } catch (e) {
      toast({ title: "Briefing failed", description: e instanceof Error ? e.message : "" });
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
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="text-sm text-gray-600">{flight?.planned_at && new Date(flight.planned_at).toLocaleString()}</div>
        </div>

        <Card className="bg-white/80 backdrop-blur border-0 shadow-lg mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plane className="w-5 h-5 text-blue-600" />
              {loadingFlight ? "Loading flight..." : `${flight?.departure} → ${(flight?.intermediates || []).join(" ")} ${flight?.arrival}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Names Row */}
            {!loadingFlight && (
              <div className="text-sm text-gray-700 mb-3">
                {[flight?.departure, ...(flight?.intermediates || []), flight?.arrival]
                  .filter(Boolean)
                  .map((code: string, idx: number, arr: string[]) => (
                    <span key={idx}>
                      <span className="font-medium">{airportNames[code] || ""}</span>
                      {idx < arr.length - 1 && <span className="mx-2">→</span>}
                    </span>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {lastRefreshedAt && (
                  <>Last refreshed at {new Date(lastRefreshedAt).toLocaleString()}</>
                )}
              </div>
              <Button onClick={fetchBriefing} disabled={briefingLoading || !route} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${briefingLoading ? "animate-spin" : ""}`} />
                {briefingLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {briefingLoading && (
          <div className="mb-6 text-gray-600">Fetching latest weather and recalculating summary...</div>
        )}
        {!briefingLoading && !briefing && (
          <div className="mb-6 text-amber-700">No briefing yet. Click Refresh to fetch.</div>
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
                      .map(l => l.trim())
                      .filter(l => l.length > 0);
                    if (lines.length <= 1) {
                      return <p className="whitespace-pre-line">{briefing.summary_5line}</p>;
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

            {briefing.metars && briefing.metars.length > 0 && (
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plane className="w-5 h-5 text-blue-600" /> Current Weather (METARs)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {briefing.metars.map((m, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-4">
                        <div className="font-semibold text-blue-600 mb-1">{m.station}</div>
                        <div className="text-sm text-gray-700 font-mono">{m.raw_text}</div>
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
                    <MapPin className="w-5 h-5 text-green-600" /> Alternate Airports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {"alternate_categories_single" in briefing && (briefing as any).alternate_categories_single ? (
                    <div className="grid md:grid-cols-3 gap-4">
                      {[
                        { key: "best_fuel_efficiency", label: "Best Fuel Efficiency" },
                        { key: "least_deviation", label: "Least Deviation" },
                        { key: "safest", label: "Safest for Emergencies" },
                      ].map((cat) => {
                        const a = (briefing as any).alternate_categories_single[cat.key];
                        return (
                          <div key={cat.key}>
                            <h4 className="font-semibold text-gray-800 mb-2">{cat.label}</h4>
                            {a ? (
                              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                                <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <div>
                                  <span className="font-semibold text-green-800">{a.icao}</span>
                                  <span className="text-sm text-green-700 ml-2">{a.name}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">No suggestion</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {briefing.alternates.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                          <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-green-800">{a.icao}</span>
                            <span className="text-sm text-green-700 ml-2">{a.name}</span>
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


