// Configuration for the frontend application
window.APP_CONFIG = {
  // API base URL - in development, the API runs on port 3002
  API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3002' 
    : '',  // In production, use relative URLs
    
  // WebSocket URL
  WS_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'ws://localhost:3002'
    : `ws://${window.location.host}`,
    
  // Other configuration
  DEBUG: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
};

console.log('App configuration loaded:', window.APP_CONFIG);