import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";

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
}

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
        title: "Error",
        description: "Please enter a route",
      });
      return;
    }

    try {
      setBriefingLoading(true);

      // Parse route into airports array
      const airports = route.trim().split(/\s+/);

      // Call your FastAPI backend
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
        title: "Success",
        description: "Briefing retrieved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to get briefing",
      });
    } finally {
      setBriefingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Not authenticated</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Pilot Weather Dashboard</h1>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome, {user.email}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>You are successfully authenticated!</p>
              <p className="text-sm text-muted-foreground mt-2">
                User ID: {user.id}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Flight Route Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="route">Route</Label>
                <Input
                  id="route"
                  type="text"
                  placeholder="Enter route (e.g., KJFK EGLL LFPG)"
                  value={route}
                  onChange={(e) => setRoute(e.target.value.toUpperCase())}
                />
              </div>
              <Button
                onClick={getBriefing}
                disabled={briefingLoading}
                className="w-full"
              >
                {briefingLoading ? "Getting Briefing..." : "Get Briefing"}
              </Button>
            </CardContent>
          </Card>

          {/* Display Briefing Results */}
          {briefing && (
            <Card>
              <CardHeader>
                <CardTitle>Briefing Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">5-Line Summary:</h4>
                  <p className="text-sm">{briefing.summary_5line}</p>
                </div>

                {briefing.metars && briefing.metars.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">
                      Weather Data (METARs)
                    </h4>
                    <div className="space-y-2">
                      {briefing.metars.map((metar, idx) => (
                        <div key={idx} className="text-sm bg-muted p-2 rounded">
                          <strong>{metar.station}:</strong> {metar.raw_text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {briefing.hazards && briefing.hazards.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Hazards</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {briefing.hazards.map((hazard, idx) => (
                        <li key={idx} className="text-sm text-destructive">
                          {hazard}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {briefing.alternates && briefing.alternates.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Alternate Airports</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {briefing.alternates.map((alt, idx) => (
                        <li key={idx} className="text-sm">
                          {alt.icao} - {alt.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
