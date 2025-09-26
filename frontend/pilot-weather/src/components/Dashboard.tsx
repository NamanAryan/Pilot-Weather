import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import DateTimePicker from "./ui/DateTimePicker";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import {
  Plane,
  Route,
  AlertTriangle,
  MapPin,
  LogOut,
  Send,
  Plus,
  Clock,
  History,
  Search,
  Equal,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";

interface Briefing {
  summary_5line: string;
  metars?: Array<{
    station: string;
    raw_text: string;
  }>;
  hazards?: string[];
  alternates?: Array<{
    icao: string;
    name: string;
  }>;
  alternate_categories?: {
    least_deviation?: Array<{ icao: string; name?: string | null }>;
    best_fuel_efficiency?: Array<{ icao: string; name?: string | null }>;
    safest?: Array<{ icao: string; name?: string | null }>;
  };
}

type FlightStatus = "upcoming" | "past";

interface FlightRow {
  id: string;
  user_id: string;
  departure: string;
  arrival: string;
  intermediates: string[] | null;
  planned_at: string | null;
  created_at: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const { toast } = useToast();

  // Flight planner state
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [intermediates, setIntermediates] = useState<string[]>([]);
  const [plannedAt, setPlannedAt] = useState<string>("");
  const [savingFlight, setSavingFlight] = useState(false);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [upcomingFlights, setUpcomingFlights] = useState<FlightRow[]>([]);
  const [pastFlights, setPastFlights] = useState<FlightRow[]>([]);
  const [activePanel, setActivePanel] = useState<"add" | "search" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const reloadFlights = async (uid: string) => {
    try {
      setLoadingFlights(true);
      const { data, error } = await supabase
        .from("flights")
        .select(
          "id,user_id,departure,arrival,intermediates,planned_at,created_at"
        )
        .eq("user_id", uid)
        .order("planned_at", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const now = new Date();
      const upcoming: FlightRow[] = [];
      const past: FlightRow[] = [];
      (data || []).forEach((row) => {
        const when = row.planned_at ? new Date(row.planned_at) : null;
        if (when && when.getTime() >= now.getTime()) {
          upcoming.push(row as FlightRow);
        } else {
          past.push(row as FlightRow);
        }
      });
      setUpcomingFlights(upcoming);
      setPastFlights(past.reverse());
    } catch (e) {
      toast({
        title: "Could not load flights",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setLoadingFlights(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      reloadFlights(user.id);
    }
  }, [user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const getBriefing = async () => {
    if (!route.trim()) {
      toast({
        title: "Route Required",
        description: "Please enter a flight route",
      });
      return;
    }
    // Navigate to detail page using route string
    briefFromFlight({
      id: "route",
      user_id: user?.id,
      departure: route.trim().split(/\s+/)[0],
      arrival: route.trim().split(/\s+/).slice(-1)[0],
      intermediates: route.trim().split(/\s+/).slice(1, -1),
      planned_at: null,
      created_at: new Date().toISOString(),
    } as any);
  };

  const addIntermediate = () => {
    setIntermediates([...intermediates, ""]);
  };

  const updateIntermediate = (idx: number, value: string) => {
    setIntermediates((prev) =>
      prev.map((v, i) => (i === idx ? value.toUpperCase() : v))
    );
  };

  const removeIntermediate = (idx: number) => {
    setIntermediates((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveFlight = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save flights",
      });
      return;
    }
    const dep = departure.trim().toUpperCase();
    const arr = arrival.trim().toUpperCase();
    const mids = intermediates
      .map((i) => i.trim().toUpperCase())
      .filter(Boolean);
    if (!dep || !arr) {
      toast({
        title: "Missing fields",
        description: "Departure and arrival are required",
      });
      return;
    }
    if (!plannedAt) {
      toast({
        title: "Missing time",
        description: "Planned date and time is required",
      });
      return;
    }
    try {
      setSavingFlight(true);
      const payload = {
        user_id: user.id,
        departure: dep,
        arrival: arr,
        intermediates: mids.length ? mids : null,
        planned_at: new Date(plannedAt).toISOString(),
      };
      const { error } = await supabase.from("flights").insert(payload);
      if (error) throw error;
      toast({
        title: "Flight added",
        description: `${dep} → ${arr}`,
        variant: "success",
      });
      setDeparture("");
      setArrival("");
      setIntermediates([]);
      setPlannedAt("");
      reloadFlights(user.id);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setSavingFlight(false);
    }
  };

  const deleteFlight = async (id: string) => {
    try {
      const { error } = await supabase.from("flights").delete().eq("id", id);
      if (error) throw error;
      if (user?.id) reloadFlights(user.id);
      toast({ title: "Flight deleted", variant: "error" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "",
      });
    }
  };

  const briefFromFlight = async (f: FlightRow) => {
    if (f.id === "route") {
      const parts = [f.departure, ...(f.intermediates || []), f.arrival]
        .filter(Boolean)
        .join(" ");
      navigate(`/brief?route=${encodeURIComponent(parts)}`);
    } else {
      navigate(`/flight/${f.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-6 h-6 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">
          Please sign in to access your dashboard
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Top Greeting & Sign Out */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Welcome back, Pilot
              </h1>
              <p className="text-sm text-gray-600">
                Aviation Weather Dashboard
              </p>
            </div>
          </div>
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6">
          {/* Toggle Buttons */}
          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setActivePanel("add")}
              className={`p-10 rounded-2xl border text-left transition-all ${
                activePanel === "add"
                  ? "bg-blue-600 text-white border-blue-700 shadow-lg"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Equal
                  className={`w-8 h-8 ${
                    activePanel === "add" ? "text-white" : "text-blue-600"
                  }`}
                />
                <div className="text-2xl font-semibold">Add Flight</div>
              </div>
              <div
                className={`mt-3 text-base ${
                  activePanel === "add" ? "text-blue-100" : "text-gray-600"
                }`}
              >
                Create and save a personalized flight
              </div>
            </button>
            <button
              onClick={() => setActivePanel("search")}
              className={`p-10 rounded-2xl border text-left transition-all ${
                activePanel === "search"
                  ? "bg-blue-600 text-white border-blue-700 shadow-lg"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Search
                  className={`w-8 h-8 ${
                    activePanel === "search" ? "text-white" : "text-blue-600"
                  }`}
                />
                <div className="text-2xl font-semibold">Search Flight</div>
              </div>
              <div
                className={`mt-3 text-base ${
                  activePanel === "search" ? "text-blue-100" : "text-gray-600"
                }`}
              >
                Run a one-off route briefing
              </div>
            </button>
          </div>

          {/* Add Flight Panel */}
          <Card
            className={`bg-white/80 backdrop-blur border-0 shadow-lg transition-all ${
              activePanel === "add"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 h-0 overflow-hidden"
            }`}
          >
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="w-5 h-5 text-blue-600" />
                Add Flight
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="dep"
                    className="text-sm font-medium text-gray-700"
                  >
                    Departure
                  </Label>
                  <Input
                    id="dep"
                    value={departure}
                    onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                    placeholder="e.g., KJFK"
                    className="h-11 border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="arr"
                    className="text-sm font-medium text-gray-700"
                  >
                    Arrival
                  </Label>
                  <Input
                    id="arr"
                    value={arrival}
                    onChange={(e) => setArrival(e.target.value.toUpperCase())}
                    placeholder="e.g., KLAX"
                    className="h-11 border-gray-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">
                    Intermediate Airports
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addIntermediate}
                    className="h-9 gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {intermediates.map((val, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={val}
                        onChange={(e) =>
                          updateIntermediate(idx, e.target.value)
                        }
                        placeholder="e.g., KORD"
                        className="h-11 border-gray-200"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeIntermediate(idx)}
                        className="h-11"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Planned Time
                </Label>
                <DateTimePicker value={plannedAt} onChange={setPlannedAt} />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={saveFlight}
                  disabled={savingFlight}
                  className="h-11 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {savingFlight ? "Saving..." : "Add Flight"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Flight Panel */}
          <Card
            className={`bg-white/80 backdrop-blur border-0 shadow-lg transition-all ${
              activePanel === "search"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 h-0 overflow-hidden"
            }`}
          >
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="w-5 h-5 text-blue-600" />
                Search Flight
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="route"
                  className="text-sm font-medium text-gray-700"
                >
                  Enter your flight route
                </Label>
                <Input
                  id="route"
                  type="text"
                  placeholder="e.g., KJFK EGLL LFPG"
                  value={route}
                  onChange={(e) => setRoute(e.target.value.toUpperCase())}
                  className="h-11 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <Button
                onClick={getBriefing}
                disabled={briefingLoading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200"
              >
                {briefingLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Route...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Get Weather Briefing
                  </div>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Flight History (collapsible, collapsed by default) */}
          <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full text-left px-6 pt-6 pb-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <History className="w-5 h-5 text-blue-600" />
                Flight History
              </div>
              <span className="text-sm text-gray-500">
                {historyOpen ? "Hide" : "Show"}
              </span>
            </button>
            <CardContent
              className={`space-y-6 transition-all ${
                historyOpen ? "block" : "hidden"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2 text-gray-800 font-semibold">
                  <Clock className="w-4 h-4" /> Upcoming
                </div>
                {loadingFlights ? (
                  <div className="text-sm text-gray-600">Loading...</div>
                ) : upcomingFlights.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No upcoming flights
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {upcomingFlights.map((f) => (
                      <div key={f.id} className="group relative">
                        <button
                          onClick={() => briefFromFlight(f)}
                          className="w-full text-left p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"
                        >
                          <div className="font-semibold text-blue-800">
                            {f.departure} →{" "}
                            {[...(f.intermediates || [])].join(" ")} {f.arrival}
                          </div>
                          {f.planned_at && (
                            <div className="text-xs text-blue-700 mt-1">
                              {new Date(f.planned_at).toLocaleString()}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => deleteFlight(f.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600"
                          title="Delete"
                          aria-label="Delete upcoming flight"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 text-gray-800 font-semibold">
                  <History className="w-4 h-4" /> Past
                </div>
                {loadingFlights ? (
                  <div className="text-sm text-gray-600">Loading...</div>
                ) : pastFlights.length === 0 ? (
                  <div className="text-sm text-gray-500">No past flights</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {pastFlights.map((f) => (
                      <div key={f.id} className="group relative">
                        <button
                          onClick={() => briefFromFlight(f)}
                          className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100"
                        >
                          <div className="font-semibold text-gray-800">
                            {f.departure} →{" "}
                            {[...(f.intermediates || [])].join(" ")} {f.arrival}
                          </div>
                          {f.planned_at && (
                            <div className="text-xs text-gray-600 mt-1">
                              {new Date(f.planned_at).toLocaleString()}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => deleteFlight(f.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600"
                          title="Delete"
                          aria-label="Delete past flight"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Briefing Results */}
          {briefing && (
            <div className="grid gap-6">
              {/* Summary */}
              <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Flight Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-gray-800 whitespace-pre-line leading-relaxed">
                      {briefing.summary_5line}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Weather Data */}
              {briefing.metars && briefing.metars.length > 0 && (
                <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Plane className="w-5 h-5 text-blue-600" />
                      Current Weather (METARs)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {briefing.metars.map((metar, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-4">
                          <div className="font-semibold text-blue-600 mb-1">
                            {metar.station}
                          </div>
                          <div className="text-sm text-gray-700 font-mono">
                            {metar.raw_text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hazards and Alternates Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Hazards */}
                {briefing.hazards && briefing.hazards.length > 0 && (
                  <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        Weather Hazards
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {briefing.hazards.map((hazard, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg"
                          >
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-amber-800">
                              {hazard}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Alternates - Categorized */}
                {(briefing.alternate_categories || briefing.alternates) && (
                  <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MapPin className="w-5 h-5 text-green-600" />
                        Alternate Airports
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {briefing.alternate_categories ? (
                        <div className="grid md:grid-cols-3 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">
                              Least Deviation
                            </h4>
                            <div className="space-y-2">
                              {(
                                briefing.alternate_categories.least_deviation ||
                                []
                              ).map((alt, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                                >
                                  <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-green-800">
                                      {alt.icao}
                                    </span>
                                    <span className="text-sm text-green-700 ml-2">
                                      {alt.name}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">
                              Best Fuel Efficiency
                            </h4>
                            <div className="space-y-2">
                              {(
                                briefing.alternate_categories
                                  .best_fuel_efficiency || []
                              ).map((alt, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                                >
                                  <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-green-800">
                                      {alt.icao}
                                    </span>
                                    <span className="text-sm text-green-700 ml-2">
                                      {alt.name}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">
                              Safest
                            </h4>
                            <div className="space-y-2">
                              {(briefing.alternate_categories.safest || []).map(
                                (alt, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                                  >
                                    <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    <div>
                                      <span className="font-semibold text-green-800">
                                        {alt.icao}
                                      </span>
                                      <span className="text-sm text-green-700 ml-2">
                                        {alt.name}
                                      </span>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(briefing.alternates || []).map((alt, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                            >
                              <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-green-800">
                                  {alt.icao}
                                </span>
                                <span className="text-sm text-green-700 ml-2">
                                  {alt.name}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
