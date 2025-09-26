import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { Plane, Route, AlertTriangle, MapPin, LogOut, Send } from "lucide-react";

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

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const { toast } = useToast();

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

    try {
      setBriefingLoading(true);

      const airports = route.trim().split(/\s+/);

      const response = await fetch("http://localhost:8000/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airports }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const briefingData = await response.json();
      setBriefing(briefingData);

      toast({
        title: "Briefing Complete",
        description: "Flight briefing retrieved successfully",
      });
    } catch (error) {
      toast({
        title: "Briefing Failed",
        description:
          error instanceof Error ? error.message : "Failed to get briefing",
      });
    } finally {
      setBriefingLoading(false);
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
        <div className="text-gray-600">Please sign in to access your dashboard</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Flight Briefing</h1>
              <p className="text-sm text-gray-600">Aviation Weather Dashboard</p>
            </div>
          </div>
          <Button onClick={handleSignOut} variant="outline" className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6">
          {/* Welcome Card */}
          <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-lg">
                    {user.email?.[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Welcome back, Pilot</h3>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Route Input */}
          <Card className="bg-white/80 backdrop-blur border-0 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="w-5 h-5 text-blue-600" />
                Flight Route
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="route" className="text-sm font-medium text-gray-700">
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
                          <div key={idx} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-amber-800">{hazard}</span>
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
                            <h4 className="font-semibold text-gray-800 mb-2">Least Deviation</h4>
                            <div className="space-y-2">
                              {(briefing.alternate_categories.least_deviation || []).map((alt, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                                  <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-green-800">{alt.icao}</span>
                                    <span className="text-sm text-green-700 ml-2">{alt.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Best Fuel Efficiency</h4>
                            <div className="space-y-2">
                              {(briefing.alternate_categories.best_fuel_efficiency || []).map((alt, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                                  <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-green-800">{alt.icao}</span>
                                    <span className="text-sm text-green-700 ml-2">{alt.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Safest</h4>
                            <div className="space-y-2">
                              {(briefing.alternate_categories.safest || []).map((alt, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                                  <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div>
                                    <span className="font-semibold text-green-800">{alt.icao}</span>
                                    <span className="text-sm text-green-700 ml-2">{alt.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(briefing.alternates || []).map((alt, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                              <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-green-800">{alt.icao}</span>
                                <span className="text-sm text-green-700 ml-2">{alt.name}</span>
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
