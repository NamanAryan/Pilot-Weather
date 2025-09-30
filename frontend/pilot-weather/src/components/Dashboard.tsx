import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import DateTimePicker from "./ui/DateTimePicker";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { AirportAutocomplete } from "./AirportAutocomplete";
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
  fatigue_warning?: boolean;
  fatigue_reason?: string;
}

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
  const [briefingLoading] = useState(false);
  const [briefing] = useState<Briefing | null>(null);

  // Search flight state (separate from Add Flight)
  const [searchDeparture, setSearchDeparture] = useState("");
  const [searchArrival, setSearchArrival] = useState("");
  const [searchIntermediates, setSearchIntermediates] = useState<string[]>([]);
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
  const [planeAnimating, setPlaneAnimating] = useState(false);
  const [deletingFlightId, setDeletingFlightId] = useState<string | null>(null);

  // Function to detect fatigue warnings for flights within 48 hours
  const detectFatigueWarnings = (flights: FlightRow[]) => {
    const upcomingFlights = flights.filter(
      (f) => f.planned_at && new Date(f.planned_at) > new Date()
    );
    const warnings = new Set<string>();

    // Sort flights by planned_at date
    upcomingFlights.sort((a, b) => {
      if (!a.planned_at || !b.planned_at) return 0;
      return (
        new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime()
      );
    });

    // Check each flight against the next one
    for (let i = 0; i < upcomingFlights.length - 1; i++) {
      const currentFlight = upcomingFlights[i];
      const nextFlight = upcomingFlights[i + 1];

      if (!currentFlight.planned_at || !nextFlight.planned_at) continue;

      const currentTime = new Date(currentFlight.planned_at).getTime();
      const nextTime = new Date(nextFlight.planned_at).getTime();
      const timeDifference = nextTime - currentTime;
      const hoursDifference = timeDifference / (1000 * 60 * 60);

      // If flights are within 48 hours, mark the later flight for fatigue warning
      if (hoursDifference <= 48) {
        warnings.add(nextFlight.id);
      }
    }

    return warnings;
  };

  // Validation state
  const [departureValid, setDepartureValid] = useState(false);
  const [arrivalValid, setArrivalValid] = useState(false);
  const [, , setIntermediatesValid] = useState<boolean[]>([]);
  const [searchDepartureValid, setSearchDepartureValid] = useState(false);
  const [searchArrivalValid, setSearchArrivalValid] = useState(false);
  const navigate = useNavigate();

  // Function to get user's first name from Google account
  const getUserFirstName = () => {
    if (!user) return "Pilot";

    // Debug: Log user object to see available data
    console.log("User object:", user);
    console.log("User metadata:", user.user_metadata);
    console.log("Raw user metadata:", user.raw_user_meta_data);

    // Try to get first name from user_metadata
    if (user.user_metadata?.full_name) {
      const fullName = user.user_metadata.full_name;
      const firstName = fullName.split(" ")[0];
      console.log("Found first name from user_metadata:", firstName);
      return firstName || "Pilot";
    }

    // Try to get first name from raw_user_meta_data
    if (user.raw_user_meta_data?.full_name) {
      const fullName = user.raw_user_meta_data.full_name;
      const firstName = fullName.split(" ")[0];
      console.log("Found first name from raw_user_meta_data:", firstName);
      return firstName || "Pilot";
    }

    // Try to get first name from email (before @)
    if (user.email) {
      const emailName = user.email.split("@")[0];
      // Convert to title case
      const firstName =
        emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase();
      console.log("Using email name as first name:", firstName);
      return firstName;
    }

    console.log("No name found, using default: Pilot");
    return "Pilot";
  };

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
    const dep = searchDeparture.trim().toUpperCase();
    const arr = searchArrival.trim().toUpperCase();
    const mids = searchIntermediates
      .map((i) => i.trim().toUpperCase())
      .filter(Boolean);

    if (!dep || !arr) {
      toast({
        title: "Missing fields",
        description: "Departure and arrival airports are required",
      });
      return;
    }

    if (!searchDepartureValid || !searchArrivalValid) {
      toast({
        title: "Invalid airports",
        description: "Please select valid airports from the dropdown",
      });
      return;
    }

    // Start plane animation
    setPlaneAnimating(true);

    // Wait for animation to complete (2000ms) + extra delay for visibility
    setTimeout(() => {
      // Create route string from individual inputs
      const routeParts = [dep, ...mids, arr].filter(Boolean);
      console.log("Route parts:", routeParts);

      // Navigate to detail page using route string
      briefFromFlight({
        id: "route",
        user_id: user?.id,
        departure: dep,
        arrival: arr,
        intermediates: mids,
        planned_at: null,
        created_at: new Date().toISOString(),
      } as any);

      // Reset animation state after navigation
      setTimeout(() => {
        setPlaneAnimating(false);
      }, 100);
    }, 2200);
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

  // Search flight intermediate functions
  const addSearchIntermediate = () => {
    setSearchIntermediates([...searchIntermediates, ""]);
  };

  const updateSearchIntermediate = (idx: number, value: string) => {
    setSearchIntermediates((prev) =>
      prev.map((v, i) => (i === idx ? value.toUpperCase() : v))
    );
  };

  const removeSearchIntermediate = (idx: number) => {
    setSearchIntermediates((prev) => prev.filter((_, i) => i !== idx));
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

    if (!departureValid || !arrivalValid) {
      toast({
        title: "Invalid airports",
        description: "Please select valid airports from the dropdown",
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
    setDeletingFlightId(id);

    // Add a small delay for the animation
    setTimeout(async () => {
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
      } finally {
        setDeletingFlightId(null);
      }
    }, 500);
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-6 h-6 border-2 border-gray-600/30 border-t-gray-600 rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-600">
          Please sign in to access your dashboard
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-gray-800 to-black rounded-2xl flex items-center justify-center shadow-lg">
              <Plane className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                Welcome back, {getUserFirstName()}
              </h1>
              <p className="text-slate-600 text-lg">
                Aviation Weather Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="flex items-center gap-2 px-6 py-2 rounded-xl border-slate-200 hover:bg-gray-800 hover:text-white hover:border-gray-800 hover-lift btn-press"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Action Buttons */}
          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setActivePanel("add")}
              className={`p-8 rounded-3xl border-2 text-left transition-all duration-300 hover-lift btn-press zoom-in ${
                activePanel === "add"
                  ? "bg-gradient-to-br from-gray-800 to-black text-white border-gray-800 shadow-xl"
                  : "bg-white border-slate-200 hover:border-gray-300 hover:shadow-lg"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    activePanel === "add" ? "bg-white/20" : "bg-gray-50"
                  }`}
                >
                  <Equal
                    className={`w-6 h-6 ${
                      activePanel === "add" ? "text-white" : "text-gray-600"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-2xl font-bold">Add Flight</div>
                  <div
                    className={`text-base mt-2 ${
                      activePanel === "add" ? "text-gray-100" : "text-slate-600"
                    }`}
                  >
                    Create and save a personalized flight
                  </div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setActivePanel("search")}
              className={`p-8 rounded-3xl border-2 text-left transition-all duration-300 hover-lift btn-press zoom-in ${
                activePanel === "search"
                  ? "bg-gradient-to-br from-gray-800 to-black text-white border-gray-800 shadow-xl"
                  : "bg-white border-slate-200 hover:border-gray-300 hover:shadow-lg"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    activePanel === "search" ? "bg-white/20" : "bg-gray-50"
                  }`}
                >
                  <Search
                    className={`w-6 h-6 ${
                      activePanel === "search" ? "text-white" : "text-gray-600"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-2xl font-bold">Search Flight</div>
                  <div
                    className={`text-base mt-2 ${
                      activePanel === "search"
                        ? "text-gray-100"
                        : "text-slate-600"
                    }`}
                  >
                    Run a one-off route briefing
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Add Flight Panel */}
          <Card
            className={`bg-white rounded-3xl border-0 shadow-xl transition-all duration-500 ${
              activePanel === "add"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 h-0 overflow-hidden"
            }`}
          >
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center">
                  <Route className="w-5 h-5 text-gray-600" />
                </div>
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
                  <AirportAutocomplete
                    value={departure}
                    onChange={setDeparture}
                    placeholder="e.g., KJFK"
                    className="h-11"
                    onValidationChange={setDepartureValid}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="arr"
                    className="text-sm font-medium text-gray-700"
                  >
                    Arrival
                  </Label>
                  <AirportAutocomplete
                    value={arrival}
                    onChange={setArrival}
                    placeholder="e.g., KLAX"
                    className="h-11"
                    onValidationChange={setArrivalValid}
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
                  className="h-11 bg-gray-800 hover:bg-black text-white hover-lift btn-press"
                >
                  {savingFlight ? "Saving..." : "Add Flight"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Flight Panel */}
          <Card
            className={`bg-white rounded-3xl border-0 shadow-xl transition-all duration-500 ${
              activePanel === "search"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 h-0 overflow-hidden"
            }`}
          >
            <CardHeader className="pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center">
                  <Search className="w-5 h-5 text-gray-600" />
                </div>
                Search Flight
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="search-dep"
                    className="text-sm font-medium text-gray-700"
                  >
                    Departure
                  </Label>
                  <AirportAutocomplete
                    value={searchDeparture}
                    onChange={setSearchDeparture}
                    placeholder="e.g., KJFK"
                    className="h-11"
                    onValidationChange={setSearchDepartureValid}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="search-arr"
                    className="text-sm font-medium text-gray-700"
                  >
                    Arrival
                  </Label>
                  <AirportAutocomplete
                    value={searchArrival}
                    onChange={setSearchArrival}
                    placeholder="e.g., KLAX"
                    className="h-11"
                    onValidationChange={setSearchArrivalValid}
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
                    onClick={addSearchIntermediate}
                    className="h-9 gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {searchIntermediates.map((val, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={val}
                        onChange={(e) =>
                          updateSearchIntermediate(idx, e.target.value)
                        }
                        placeholder="e.g., KORD"
                        className="h-11 border-gray-200"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeSearchIntermediate(idx)}
                        className="h-11"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                onClick={getBriefing}
                disabled={briefingLoading || planeAnimating}
                className={`w-full h-11 bg-gray-800 hover:bg-black text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 plane-animation hover-lift btn-press ${
                  planeAnimating ? "animating" : ""
                }`}
              >
                {briefingLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Route...
                  </div>
                ) : planeAnimating ? (
                  <div className="flex items-center gap-2">
                    {/* Text will be hidden by CSS during animation */}
                    <Send className="w-4 h-4" />
                    Getting Briefing...
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
              className="w-full text-left px-6 pt-6 pb-4 flex items-center justify-between hover-lift btn-press"
            >
              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <History className="w-5 h-5 text-gray-600" />
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
                    {upcomingFlights.map((f) => {
                      const fatigueWarnings =
                        detectFatigueWarnings(upcomingFlights);
                      const hasFatigueWarning = fatigueWarnings.has(f.id);

                      return (
                        <div
                          key={f.id}
                          className={`group relative ${
                            deletingFlightId === f.id ? "delete-fade" : ""
                          }`}
                        >
                          <button
                            onClick={() => briefFromFlight(f)}
                            className={`w-full text-left p-3 rounded-lg border shadow-lg hover-lift btn-press zoom-in ${
                              hasFatigueWarning
                                ? "bg-gradient-to-br from-red-600 to-red-800 border-red-700 hover:from-red-700 hover:to-red-900"
                                : "bg-gradient-to-br from-gray-800 to-black border-gray-800 hover:from-black hover:to-gray-800"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-white">
                                {f.departure} →{" "}
                                {[...(f.intermediates || [])].join(" ")}{" "}
                                {f.arrival}
                              </div>
                              {hasFatigueWarning && (
                                <div className="flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                                  <AlertTriangle className="w-3 h-3" />
                                  FATIGUE RISK
                                </div>
                              )}
                            </div>
                            {f.planned_at && (
                              <div className="text-xs text-gray-200 mt-1">
                                {new Date(f.planned_at).toLocaleString()}
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => deleteFlight(f.id)}
                            className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 hover-scale btn-press ${
                              deletingFlightId === f.id
                                ? "delete-animation"
                                : ""
                            }`}
                            title="Delete"
                            aria-label="Delete upcoming flight"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
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
                      <div
                        key={f.id}
                        className={`group relative ${
                          deletingFlightId === f.id ? "delete-fade" : ""
                        }`}
                      >
                        <button
                          onClick={() => briefFromFlight(f)}
                          className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100 hover-lift btn-press zoom-in"
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
                          className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600 hover-scale btn-press ${
                            deletingFlightId === f.id ? "delete-animation" : ""
                          }`}
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
              <Card className="bg-white rounded-3xl border-0 shadow-xl">
                <CardHeader className="pb-6">
                  <CardTitle className="text-xl font-bold">
                    Flight Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6">
                    <p className="text-slate-800 whitespace-pre-line leading-relaxed text-lg">
                      {briefing.summary_5line}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Weather Data */}
              {briefing.metars && briefing.metars.length > 0 && (
                <Card className="bg-white rounded-3xl border-0 shadow-xl">
                  <CardHeader className="pb-6">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center">
                        <Plane className="w-5 h-5 text-gray-600" />
                      </div>
                      Current Weather (METARs)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      {briefing.metars.map((metar, idx) => (
                        <div
                          key={idx}
                          className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl p-6"
                        >
                          <div className="font-bold text-gray-600 mb-2 text-lg">
                            {metar.station}
                          </div>
                          <div className="text-sm text-slate-700 font-mono bg-white rounded-xl p-3">
                            {metar.raw_text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Alternate Airports Section */}
              {briefing.alternate_categories && (
                <Card className="bg-white rounded-3xl border-0 shadow-xl">
                  <CardHeader className="pb-6">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="w-10 h-10 bg-purple-50 rounded-2xl flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-purple-600" />
                      </div>
                      Alternate Airports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Least Deviation */}
                      {briefing.alternate_categories.least_deviation &&
                        briefing.alternate_categories.least_deviation.length >
                          0 && (
                          <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
                            <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2 text-lg">
                              <MapPin className="w-5 h-5" />
                              Least Deviation
                            </h4>
                            <div className="space-y-2">
                              {briefing.alternate_categories.least_deviation.map(
                                (airport, idx) => (
                                  <div
                                    key={idx}
                                    className="text-sm text-blue-700"
                                  >
                                    <span className="font-semibold">
                                      {airport.icao}
                                    </span>
                                    {airport.name && (
                                      <span className="ml-2 text-blue-600">
                                        - {airport.name}
                                      </span>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Best Fuel Efficiency */}
                      {briefing.alternate_categories.best_fuel_efficiency &&
                        briefing.alternate_categories.best_fuel_efficiency
                          .length > 0 && (
                          <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
                            <h4 className="font-bold text-green-800 mb-4 flex items-center gap-2 text-lg">
                              <MapPin className="w-5 h-5" />
                              Best Fuel Efficiency
                            </h4>
                            <div className="space-y-2">
                              {briefing.alternate_categories.best_fuel_efficiency.map(
                                (airport, idx) => (
                                  <div
                                    key={idx}
                                    className="text-sm text-green-700"
                                  >
                                    <span className="font-semibold">
                                      {airport.icao}
                                    </span>
                                    {airport.name && (
                                      <span className="ml-2 text-green-600">
                                        - {airport.name}
                                      </span>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Safest */}
                      {briefing.alternate_categories.safest &&
                        briefing.alternate_categories.safest.length > 0 && (
                          <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
                            <h4 className="font-bold text-red-800 mb-4 flex items-center gap-2 text-lg">
                              <MapPin className="w-5 h-5" />
                              Safest
                            </h4>
                            <div className="space-y-2">
                              {briefing.alternate_categories.safest.map(
                                (airport, idx) => (
                                  <div
                                    key={idx}
                                    className="text-sm text-red-700"
                                  >
                                    <span className="font-semibold">
                                      {airport.icao}
                                    </span>
                                    {airport.name && (
                                      <span className="ml-2 text-red-600">
                                        - {airport.name}
                                      </span>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Hazards */}
              {briefing.hazards && briefing.hazards.length > 0 && (
                <Card className="bg-white rounded-3xl border-0 shadow-xl">
                  <CardHeader className="pb-6">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center border border-red-200 shadow-sm">
                        <AlertTriangle className="w-5 h-5 text-red-700" />
                      </div>
                      Weather Hazards
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {briefing.hazards.map((hazard, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border border-red-200 shadow-sm"
                        >
                          <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 flex-shrink-0" />
                          <span className="text-red-700 font-medium">
                            {hazard}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
