// ---------------------------------------------------------------------------
// API configuration
//
// Local development (served from your machine, e.g. `python3 -m http.server`)
// automatically talks to a Django dev server on 127.0.0.1:8000.
//
// In production (deployed to Netlify) this points at your live Render URL.
// After you deploy the backend on Render, replace the string below with your
// service's URL, e.g. "https://task-manager-api-xxxx.onrender.com/api".
// ---------------------------------------------------------------------------

const PRODUCTION_API_BASE_URL = "https://REPLACE-WITH-YOUR-RENDER-URL.onrender.com/api";

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_BASE_URL = isLocal
  ? "http://127.0.0.1:8000/api"
  : PRODUCTION_API_BASE_URL;
