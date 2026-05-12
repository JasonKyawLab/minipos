// Path: frontend/lib/terminalApi.ts
// Purpose: API client for all terminal-context requests.
// AUDIT CHECKLIST: Contains the global 401 interceptor.
// No localStorage. No device_id. Cookie only.

import axios from 'axios';

const terminalApi = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  withCredentials: true, // Sends the terminal_session cookie
  timeout:         10_000,
  headers: { 'Content-Type': 'application/json' },
});

// AUDIT CHECKLIST: Global 401 interceptor.
// When the backend returns 401, the terminal session is dead.
// We have no information about why (revoked, expired, etc.)
// The only correct action is to wipe local state and redirect.
terminalApi.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Extract context from current path
      const parts   = window.location.pathname.split('/');
      // /pos/:shopId/... or /kitchen/:shopId/...
      const appType = parts[1]; // 'pos' or 'kitchen'
      const shopId  = parts[2];

      if (shopId && (appType === 'pos' || appType === 'kitchen')) {
        // Redirect to the terminal's login screen (PIN selection).
        // The terminal_session cookie is dead — the server will
        // reject it. The login screen does not need it.
        window.location.href = `/${appType}/${shopId}`;
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default terminalApi;