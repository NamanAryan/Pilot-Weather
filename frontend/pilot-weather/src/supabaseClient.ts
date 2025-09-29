import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('VITE_SUPABASE_PUBLISHABLE_KEY:', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? '✅ Set' : '❌ Missing');
  console.error('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key:", supabaseAnonKey ? "Key loaded" : "Key missing");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
