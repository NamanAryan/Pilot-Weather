// Authentication configuration for different environments
export const getAuthConfig = () => {
  const isProduction = import.meta.env.PROD;
  const baseUrl = window.location.origin;
  
  return {
    // Redirect URLs for different environments
    redirectTo: isProduction ? baseUrl : baseUrl,
    
    // Email redirect URL for magic links
    emailRedirectTo: `${baseUrl}/`,
    
    // OAuth redirect URL
    oauthRedirectTo: `${baseUrl}/`,
    
    // Debug mode
    debug: !isProduction,
  };
};

// Helper function to get redirect URL
export const getRedirectUrl = () => {
  const config = getAuthConfig();
  return config.redirectTo;
};

// Helper function to get email redirect URL
export const getEmailRedirectUrl = () => {
  const config = getAuthConfig();
  return config.emailRedirectTo;
};
