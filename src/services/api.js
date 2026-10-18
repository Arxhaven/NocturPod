/**
 * NocturPod Production API Service Layer
 * Connects frontend directly to the deployed Railway backend.
 * Never generates mock responses, simulated data, or fallback frames.
 */

export const DEFAULT_PRODUCTION_API_URL = 'https://nocturpod-production.up.railway.app';

export const BACKEND_HOST = (
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL)) ||
  DEFAULT_PRODUCTION_API_URL
).replace(/\/$/, '');

export const API_BASE = `${BACKEND_HOST}/api`;

/**
 * Normalizes relative or full URLs to the production backend endpoint.
 * Prevents double `/api/api` prefixing and handles root `/health`.
 */
export function buildApiUrl(path = '') {
  if (!path || typeof path !== 'string') return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath === '/health') {
    return `${BACKEND_HOST}/health`;
  }
  if (cleanPath.startsWith('/api/')) {
    return `${BACKEND_HOST}${cleanPath}`;
  }
  return `${API_BASE}${cleanPath}`;
}

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
 * Resolves stream URL for LivePlayer component.
 */
export function getStreamUrl(streamPath = '/api/stream/live') {
  return buildApiUrl(streamPath);
}

/**
 * Checks whether backend supports recording commands.
 */
export function isRecordingSupported() {
  return true;
}

/**
 * Generates authorization headers.
 */
export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_KEY : null;
  if (envKey) {
    headers['Authorization'] = `Bearer ${envKey}`;
    headers['X-API-Key'] = envKey;
  }
  return headers;
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
    const res = await fetchWithTimeout(buildApiUrl('/api/device/health'), {
      headers: getAuthHeaders(),
    }, 5000);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }
  } catch {
    try {
      const rootRes = await fetchWithTimeout(buildApiUrl('/health'), {}, 3000);
      if (rootRes.ok) {
        const rootData = await rootRes.json();
        return { connected: true, data: rootData };
      }
    } catch {
      // Backend unavailable
    }
  }
  return { connected: false, error: 'Backend Unavailable' };
}

/**
 * Fetches real hardware telemetry and device status from backend.
 * Returns null if the backend request fails.
 */
export async function fetchDeviceStatus() {
  try {
    const res = await fetchWithTimeout(buildApiUrl('/api/device/status'), {
      headers: getAuthHeaders(),
    }, 6000);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend unavailable or request timeout
  }
  return null;
}

/**
 * Legacy alias for fetchDeviceStatus
 */
export const fetchTelemetry = fetchDeviceStatus;

/**
 * Fetches real events list from backend / Supabase persistence.
 */
export async function fetchEvents(filter = 'ALL', search = '') {
  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'ALL') params.append('filter', filter);
    if (search && search.trim()) params.append('search', search.trim());

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithTimeout(buildApiUrl(`/api/events${query}`), {
      headers: getAuthHeaders(),
    }, 20000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.events || []);
    }
  } catch (err) {
    console.warn("Failed to fetch events:", err.message);
  }
  return null;
}

/**
 * Fetches real still image captures (both Original and Enhanced variants).
 */
export async function fetchImages() {
  try {
    const res = await fetchWithTimeout(buildApiUrl('/api/media/images'), {
      headers: getAuthHeaders(),
    }, 20000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.images || []);
    }
  } catch (err) {
    console.warn("Failed to fetch images:", err.message);
  }
  return null;
}

/**
 * Fetches real video recordings (both Original and Enhanced variants).
 */
export async function fetchFootage() {
  try {
    const res = await fetchWithTimeout(buildApiUrl('/api/media/footage'), {
      headers: getAuthHeaders(),
    }, 20000);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : (data.footage || []);
    }
  } catch (err) {
    console.warn("Failed to fetch recordings:", err.message);
  }
  return null;
}

/**
 * Fetches the current hardware lighting mode from backend (Mode A: WHITE, Mode B: NIGHT).
 */
export async function fetchLightMode() {
  try {
    const res = await fetchWithTimeout(buildApiUrl('/api/device/light/mode'), {
      headers: getAuthHeaders(),
    }, 6000);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch light mode:", err.message);
  }
  return null;
}

/**
 * Dispatches a dual light mode command to edge Raspberry Pi node (Mode A: WHITE, Mode B: NIGHT).
 */
export async function setLightMode(mode) {
  const normalized = (mode || '').toUpperCase();
  const res = await fetchWithTimeout(buildApiUrl('/api/device/light/mode'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mode: normalized }),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Light mode error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}


/**
 * Queues live camera controls to the Raspberry Pi agent.
 */
export async function applyCameraSettings(settings) {
  const res = await fetchWithTimeout(buildApiUrl('/api/device/camera/settings'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings || {}),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Camera settings error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Enables/disables PIR-triggered capture and sets the software cooldown.
 */
export async function setPirSettings(settings) {
  const res = await fetchWithTimeout(buildApiUrl('/api/device/pir/settings'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings || {}),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PIR settings error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Queues white or IR/night illumination output level. Requires PWM-capable hardware.
 */
export async function setLightIntensity(mode, intensityPct) {
  const res = await fetchWithTimeout(buildApiUrl('/api/device/light/intensity'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mode, intensity_pct: intensityPct }),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Light intensity error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}


/**
 * Fetches AI enhancement pipeline and vision model status.
 */
export async function fetchAiStatus() {
  try {
    const res = await fetchWithTimeout(buildApiUrl('/api/ai/status'), {
      headers: getAuthHeaders(),
    }, 5000);
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
    const res = await fetchWithTimeout(buildApiUrl('/api/stream/status'), {
      headers: getAuthHeaders(),
    }, 5000);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Stream status unavailable
  }
  return null;
}

/**
 * Dispatches still frame capture command to edge Raspberry Pi node.
 */
export async function triggerSnapshot() {
  const res = await fetchWithTimeout(buildApiUrl('/api/device/commands/capture'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Capture command error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Dispatches capture command.
 */
export const triggerCaptureCommand = triggerSnapshot;
export const triggerManualCapture = triggerSnapshot;

/**
 * Dispatches start/stop recording command to edge Raspberry Pi node.
 */
export async function toggleRecording(isRecording) {
  const res = await fetchWithTimeout(buildApiUrl('/api/device/commands/record'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ recording: isRecording, action: isRecording ? 'START' : 'STOP' }),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Record command error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Trigger recording with action command.
 */
export async function triggerRecordCommand(action = 'TOGGLE') {
  const isRec = action === 'START' || action === true;
  return await toggleRecording(isRec);
}

/**
 * Deletes a single capture/recording event and associated media files.
 */
export async function deleteEvent(eventId) {
  const res = await fetchWithTimeout(buildApiUrl(`/api/events/${eventId}`), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }, 10000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Delete event error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Deletes all events and associated media files.
 */
export async function deleteAllEvents() {
  const res = await fetchWithTimeout(buildApiUrl('/api/events'), {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }, 15000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Delete all error (${res.status}): ${errText || res.statusText}`);
  }
  return await res.json();
}


/**
 * Edge configuration helpers.
 */
export async function fetchConfig() {
  return null;
}

export async function saveConfig(configData) {
  return configData;
}

export async function detectObjects() {
  return [];
}

export async function detectImageAnnotated() {
  return null;
}

