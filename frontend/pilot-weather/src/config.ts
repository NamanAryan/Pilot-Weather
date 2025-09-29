// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD 
    ? 'https://pilot-weather-backend.onrender.com' 
    : 'http://localhost:8000');

// Application Configuration
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Pilot Weather';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

// API Endpoints
export const API_ENDPOINTS = {
  HEALTH: `${API_BASE_URL}/`,
  AIRPORT_INFO: `${API_BASE_URL}/airport-info`,
  AIRPORTS_SEARCH: `${API_BASE_URL}/airports/search`,
  ANALYZE_ROUTE: `${API_BASE_URL}/analyze-route`,
} as const;

// Environment validation
export const validateEnvironment = () => {
  const requiredEnvVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY'
  ];

  const missingVars = requiredEnvVars.filter(
    varName => !import.meta.env[varName]
  );

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    return false;
  }

  return true;
};

// Initialize environment validation
if (!validateEnvironment()) {
  console.warn('Some required environment variables are missing. The app may not work correctly.');
}
