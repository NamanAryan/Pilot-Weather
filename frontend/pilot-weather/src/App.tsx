import React from 'react';
import { supabase } from './supabaseClient';

interface User {
  email: string;
  id: string;
}

interface AppState {
  user: User | null;
  loading: boolean;
  route: string;
}

class App extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      user: null,
      loading: true,
      route: ''
    };
  }

  async componentDidMount() {
    // Check initial session
    const { data: { session } } = await supabase.auth.getSession();
    this.setState({ 
      user: session?.user
        ? { email: session.user.email ?? '', id: session.user.id }
        : null,
      loading: false 
    });

      this.setState({ 
        user: session?.user
          ? { email: session.user.email ?? '', id: session.user.id }
          : null
      });
    supabase.auth.onAuthStateChange((_event, session) => {
      this.setState({ 
        user: session?.user
          ? { email: session.user.email ?? '', id: session.user.id }
          : null
      });
    });
  }

  handleEmailSignIn = async () => {
    const email = prompt('Enter your email:');
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) alert(error.message);
      else alert('Check your email!');
    }
  };

  handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ 
      provider: 'google' 
    });
    if (error) alert(error.message);
  };

  handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  render() {
    const { user, loading, route } = this.state;

    if (loading) {
      return <div style={{ padding: '20px' }}>Loading...</div>;
    }

    if (!user) {
      return (
        <div style={{ padding: '20px' }}>
          <h1>Pilot Briefing Login</h1>
          <button 
            onClick={this.handleEmailSignIn}
            style={{ padding: '10px 20px', margin: '10px' }}
          >
            Sign in with Email
          </button>
          <button 
            onClick={this.handleGoogleSignIn}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#4285f4', 
              color: 'white', 
              border: 'none' 
            }}
          >
            Sign in with Google
          </button>
        </div>
      );
    }

    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h1>Pilot Briefing System</h1>
          <button onClick={this.handleSignOut}>Sign Out</button>
        </div>
        
        <div>
          <h2>Flight Route Input</h2>
          <input
            type="text"
            placeholder="Enter route (e.g., VIDP VABB)"
            value={route}
            onChange={e => this.setState({ route: e.target.value })}
            style={{ padding: '10px', width: '300px' }}
          />
          <button style={{ padding: '10px 20px', marginLeft: '10px' }}>
            Get Briefing
          </button>
        </div>

        <p>Welcome, {user.email}!</p>
      </div>
    );
  }
}

export default App;
