import React from "react";
import { supabase } from "./supabaseClient";

interface User {
  email: string;
  id: string;
}

interface AppState {
  user: User | null;
  loading: boolean;
  route: string;
  briefing: any | null;
}

class App extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      user: null,
      loading: true,
      route: "",
      briefing: null,
    };
  }

  async componentDidMount() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    this.setState({
      user: session?.user
        ? { email: session.user.email ?? "", id: session.user.id }
        : null,
      loading: false,
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      this.setState({
        user: session?.user
          ? { email: session.user.email ?? "", id: session.user.id }
          : null,
      });
    });
  }

  // Updated to call your FastAPI backend
  // Update the getBriefing method in your App class
  getBriefing = async () => {
    const { route } = this.state;
    if (!route.trim()) {
      alert("Please enter a route");
      return;
    }

    try {
      this.setState({ loading: true });

      // Parse route into airports array
      const airports = route.trim().split(/\s+/);

      // Call your FastAPI backend - match your endpoint
      const response = await fetch("http://localhost:8000/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airports }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const briefing = await response.json();
      this.setState({ briefing });
    } catch (error) {
      if (error instanceof Error) {
        alert(`Error getting briefing: ${error.message}`);
      } else {
        alert(`Error getting briefing: ${String(error)}`);
      }
    } finally {
      this.setState({ loading: false });
    }
  };

  handleEmailSignIn = async () => {
    const email = prompt("Enter your email:");
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) alert(error.message);
      else alert("Check your email!");
    }
  };

  handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (error) alert(error.message);
  };

  handleSignOut = async () => {
    await supabase.auth.signOut();
    this.setState({ briefing: null });
  };

  render() {
    const { user, loading, route, briefing } = this.state;

    if (loading) {
      return <div style={{ padding: "20px" }}>Loading...</div>;
    }

    if (!user) {
      return (
        <div style={{ padding: "20px" }}>
          <h1>Pilot Briefing Login</h1>
          <button
            onClick={this.handleEmailSignIn}
            style={{ padding: "10px 20px", margin: "10px" }}
          >
            Sign in with Email
          </button>
          <button
            onClick={this.handleGoogleSignIn}
            style={{
              padding: "10px 20px",
              backgroundColor: "#4285f4",
              color: "white",
              border: "none",
            }}
          >
            Sign in with Google
          </button>
        </div>
      );
    }

    return (
      <div style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <h1>Pilot Briefing System</h1>
          <button onClick={this.handleSignOut}>Sign Out</button>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h2>Flight Route Input</h2>
          <input
            type="text"
            placeholder="Enter route (e.g., KJFK EGLL LFPG)"
            value={route}
            onChange={(e) =>
              this.setState({ route: e.target.value.toUpperCase() })
            }
            style={{ padding: "10px", width: "300px" }}
          />
          <button
            onClick={this.getBriefing}
            disabled={loading}
            style={{ padding: "10px 20px", marginLeft: "10px" }}
          >
            {loading ? "Getting Briefing..." : "Get Briefing"}
          </button>
        </div>

        {/* Display Briefing Results */}
        {briefing && (
          <div
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginTop: "20px",
            }}
          >
            <h3>Briefing Summary</h3>
            <p>
              <strong>5-Line Summary:</strong> {briefing.summary_5line}
            </p>

            <div style={{ marginTop: "15px" }}>
              <h4>Weather Data</h4>
              {briefing.metars?.map((metar: any, idx: number) => (
                <div key={idx} style={{ marginBottom: "10px" }}>
                  <strong>{metar.station}:</strong> {metar.raw_text}
                </div>
              ))}
            </div>

            {briefing.hazards?.length > 0 && (
              <div style={{ marginTop: "15px" }}>
                <h4>Hazards</h4>
                <ul>
                  {briefing.hazards.map((hazard: string, idx: number) => (
                    <li key={idx}>{hazard}</li>
                  ))}
                </ul>
              </div>
            )}

            {briefing.alternates?.length > 0 && (
              <div style={{ marginTop: "15px" }}>
                <h4>Alternate Airports</h4>
                <ul>
                  {briefing.alternates.map((alt: any, idx: number) => (
                    <li key={idx}>
                      {alt.icao} - {alt.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <p>Welcome, {user.email}!</p>
      </div>
    );
  }
}

export default App;
