// Backend base URL. Set VITE_API_URL at build time (e.g. https://roadguard-api.onrender.com).
// Falls back to the local dev backend.
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5198').replace(/\/+$/, '')
