import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface DashboardProps {
  session: Session;
}

export default function Dashboard({ session }: DashboardProps) {
  const [route, setRoute] = useState('');

  const signOut = () => supabase.auth.signOut();

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1>Pilot Briefing System</h1>
        <button onClick={signOut}>Sign Out</button>
      </div>
      
      <div>
        <h2>Flight Route Input</h2>
        <input
          type="text"
          placeholder="Enter route (e.g., VIDP VABB)"
          value={route}
          onChange={e => setRoute(e.target.value)}
          style={{ padding: '10px', width: '300px' }}
        />
        <button style={{ padding: '10px 20px', marginLeft: '10px' }}>
          Get Briefing
        </button>
      </div>

      <p>Welcome, {session.user.email}!</p>
    </div>
  );
}
