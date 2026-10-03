const deployedApi = (import.meta.env.VITE_API_BASE_URL || 'https://tradinghousebe-dev.up.railway.app').replace(/\/$/, '')

// Dev stays on the Vite origin so the browser talks to http://localhost:5173.
// The dev server proxies /api to the local API. Production uses the deployed API.
export const API_BASE_URL = import.meta.env.DEV ? '' : deployedApi
