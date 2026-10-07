/**
 * NocturPod Production API Service Layer
 * Connects frontend directly to the real Render backend.
 * Never generates mock responses, simulated data, or fallback frames.
 */

export const BACKEND_HOST =
  (import.meta.env.VITE_API_URL || 'https://nocturpod-njsi.onrender.com')
    .replace(/\/$/, '');

export const API_BASE = `${BACKEND_HOST}/api`;

/**
 * Resolves media paths to absolute URLs.
 * Relative backend media paths resolve against BACKEND_HOST.
 * Absolute URLs (Supabase storage signed URLs) remain untouched.
 */
export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `${BACKEND_HOST}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Helper to perform fetch requests with an automatic abort timeout.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Checks backend connectivity and edge device health status.
 */
export async function checkBackendHealth() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/device/health`, {}, 5000);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }
  } catch (err) {
    // Network error or backend cold start / unavailable
  }
  return { connected: false, error: 'Backend Unavailable' };
}

/**
 * Fetches real hardware telemetry and device status from backend.
 * Returns null if the backend request fails.
 */
export async function fetchDeviceStatus() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/device/status`, {}, 6000);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Backend unavailable or request timeout
  }
  return null;
}

/**
 * Fetches real events list from backend / Supabase persistence.
 */
export async function fetchEvents(filter = 'ALL', search = '') {
  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'ALL') params.append('filter', filter);
    if (search && search.trim()) params.append('search', search.trim());

    const res = await fetchWithTimeout(`${API_BASE}/events?${params.toString()}`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn("Failed to fetch events:", err.message);
  }
  return [];
}

/**
 * Fetches real still image captures (both Original and Enhanced variants).
 */
export async function fetchImages() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/media/images`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn("Failed to fetch images:", err.message);
  }
  return [];
}

/**
 * Fetches real video recordings (both Original and Enhanced variants).
 */
export async function fetchFootage() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/media/footage`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn("Failed to fetch recordings:", err.message);
  }
  return [];
}

/**
 * Fetches AI enhancement pipeline and vision model status.
 */
export async function fetchAiStatus() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/ai/status`, {}, 5000);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch AI status:", err.message);
  }
  return null;
}

/**
 * Fetches live stream status (true FPS, resolution, camera_status).
 */
export async function fetchStreamStatus() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/stream/status`, {}, 5000);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Stream status unavailable
  }
  return null;
}

/**
 * Dispatches still frame capture command to edge Raspberry Pi node.
 */
export async function triggerSnapshot() {
  const res = await fetchWithTimeout(`${API_BASE}/device/commands/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, 10000);
  if (!res.ok) {
    throw new Error(`Capture command error: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Dispatches start/stop recording command to edge Raspberry Pi node.
 */
export async function toggleRecording(isRecording) {
  const res = await fetchWithTimeout(`${API_BASE}/device/commands/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording: isRecording }),
  }, 10000);
  if (!res.ok) {
    throw new Error(`Record command error: ${res.statusText}`);
  }
  return await res.json();
}
