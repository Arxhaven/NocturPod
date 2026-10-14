/**
 * NocturPod API Service Layer
 * Interfaces with NocturPod Production Backend (Render) and Edge Gateway.
 * Supports known endpoints:
 * - GET /health
 * - GET /api/device/health
 * - GET /api/device/status
 * - POST /api/device/commands/capture
 * - POST /api/device/commands/record
 * - GET /api/stream/status
 * - GET /api/stream/live
 * - GET /api/media/images
 * - GET /api/media/footage
 * - GET /api/events
 * - GET /api/ai/status
 * - POST /api/detect, POST /api/detect-image
 */

export const DEFAULT_PRODUCTION_API_URL = 'https://nocturpod-njsi.onrender.com';

// Automatically uses Vite dev proxy on localhost to avoid browser CORS restrictions,
// and points directly to Render backend in production and automated tests.
const isLocalDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE = (
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL)) ||
  (isLocalDev ? '/api' : DEFAULT_PRODUCTION_API_URL)
).trim().replace(/\/$/, '');

// Runtime credential storage: sessionStorage or dynamic injection
let runtimeApiKey = (typeof window !== 'undefined' && window.sessionStorage?.getItem('nocturpod_token')) ||
  ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || '').trim();

export function setClientApiKey(token) {
  runtimeApiKey = (token || '').trim();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    if (runtimeApiKey) {
      window.sessionStorage.setItem('nocturpod_token', runtimeApiKey);
    } else {
      window.sessionStorage.removeItem('nocturpod_token');
    }
  }
  cachedMediaToken = null;
  mediaTokenExpiresAt = 0;
}

export function getClientApiKey() {
  return runtimeApiKey;
}

// Deprecated export for backwards compatibility
export const API_KEY = runtimeApiKey;

function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const key = getClientApiKey();
  if (key) {
    headers['X-API-Key'] = key;
  }
  return headers;
}

/**
 * Normalizes endpoint paths against API_BASE without producing /api/api/...
 */
export function buildApiUrl(path = '') {
  if (!path) return API_BASE;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Root health endpoint (/health) is located at server root
  if (cleanPath === '/health') {
    const rootBase = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
    return `${rootBase}/health`;
  }

  // Prevent double /api/api/ prefixing
  if (cleanPath.startsWith('/api/') && API_BASE.endsWith('/api')) {
    return `${API_BASE}${cleanPath.slice(4)}`;
  }
  if (!cleanPath.startsWith('/api/') && API_BASE.endsWith('/api')) {
    return `${API_BASE}${cleanPath}`;
  }
  if (!cleanPath.startsWith('/api/') && !API_BASE.endsWith('/api')) {
    return `${API_BASE}/api${cleanPath}`;
  }

  return `${API_BASE}${cleanPath}`;
}

// Helper: Safely parses JSON and guards against HTML (Vercel SPA fallback index.html)
async function safeParseJsonResponse(res, endpointName = 'API') {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`${endpointName} returned HTML fallback instead of JSON. Ensure VITE_API_URL points to the real backend.`);
  }
  return await res.json();
}

// In-memory cache for short-lived, scoped media tokens
let cachedMediaToken = null;
let mediaTokenExpiresAt = 0;
let pendingMediaTokenPromise = null;

export async function fetchMediaToken() {
  const now = Date.now();
  if (cachedMediaToken && mediaTokenExpiresAt - now > 30000) {
    return cachedMediaToken;
  }

  if (pendingMediaTokenPromise) {
    return pendingMediaTokenPromise;
  }

  pendingMediaTokenPromise = (async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/token?scope=media&ttl=300'), {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await safeParseJsonResponse(res, 'Auth Token');
        cachedMediaToken = data.token;
        mediaTokenExpiresAt = Date.now() + (data.expires_in * 1000);
        return cachedMediaToken;
      }
    } catch {
      // Ignored for environments without scoped media token endpoint
    } finally {
      pendingMediaTokenPromise = null;
    }
    return cachedMediaToken;
  })();

  return pendingMediaTokenPromise;
}

/**
 * Resolves media paths to fully qualified URLs.
 * Preserves signed storage URLs (e.g. Supabase Storage signed URLs) without removing tokens.
 * NEVER prints full signed URLs or tokens to public logs.
 */
export function resolveMediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  let url = buildApiUrl(path);

  // Attach local short-lived scoped media token if cached and needed
  const now = Date.now();
  if (cachedMediaToken && mediaTokenExpiresAt - now > 5000 && !url.includes('token=')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}token=${encodeURIComponent(cachedMediaToken)}`;
  }
  return url;
}

/**
 * Returns optical stream URL.
 */
export function getStreamUrl(preferredPath = '/api/stream/live') {
  if (preferredPath.startsWith('http://') || preferredPath.startsWith('https://')) {
    return preferredPath;
  }
  return buildApiUrl(preferredPath);
}

/**
 * Indicates whether edge recording endpoints are implemented on backend.
 * The production Render backend supports POST /api/device/commands/record.
 */
export function isRecordingSupported() {
  return true;
}

/**
 * Health check on /health.
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(buildApiUrl('/health'), {
      headers: getAuthHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        return { 
          connected: false, 
          error: 'API returned HTML fallback instead of JSON. Ensure VITE_API_URL points to the real backend.' 
        };
      }
      const data = await res.json();
      return { connected: true, data };
    }
  } catch (err) {
    // Backend offline or timeout
  }
  return { connected: false, error: 'NocturPod Backend not reachable at ' + API_BASE };
}

/**
 * Fetches real hardware device status and telemetry.
 * Primary: GET /api/device/status
 * Fallbacks: GET /api/device/health, GET /api/telemetry
 */
export async function fetchTelemetry() {
  try {
    // Try /api/device/status
    const res = await fetch(buildApiUrl('/api/device/status'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await safeParseJsonResponse(res, 'Device Status');
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch {
    // Fall back to alternative endpoints
  }

  try {
    // Try /api/device/health
    const res = await fetch(buildApiUrl('/api/device/health'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await safeParseJsonResponse(res, 'Device Health');
      if (data?.device) {
        return data.device;
      }
      return data;
    }
  } catch {
    // Fall back to legacy telemetry
  }

  try {
    const res = await fetch(buildApiUrl('/telemetry'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await safeParseJsonResponse(res, 'Telemetry');
    }
  } catch {
    // Return null if none reachable
  }

  return null;
}

/**
 * Fetches live stream status (e.g. camera status, fps, resolution).
 * GET /api/stream/status
 */
export async function fetchStreamStatus() {
  try {
    const res = await fetch(buildApiUrl('/api/stream/status'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await safeParseJsonResponse(res, 'Stream Status');
    }
  } catch {
    // Stream status unavailable
  }
  return null;
}

/**
 * Fetches events timeline records from GET /api/events.
 */
export async function fetchEvents() {
  try {
    const res = await fetch(buildApiUrl('/api/events'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await safeParseJsonResponse(res, 'Events');
      if (Array.isArray(data)) return data;
      return data?.events || [];
    }
  } catch {
    // Fall back
  }
  return null;
}

/**
 * Fetches image records from GET /api/media/images.
 */
export async function fetchImages() {
  try {
    const res = await fetch(buildApiUrl('/api/media/images'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await safeParseJsonResponse(res, 'Images');
      if (Array.isArray(data)) return data;
      return data?.images || [];
    }
  } catch {
    // Fall back
  }
  return null;
}

/**
 * Fetches footage video records from GET /api/media/footage.
 */
export async function fetchFootage() {
  try {
    const res = await fetch(buildApiUrl('/api/media/footage'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await safeParseJsonResponse(res, 'Footage');
      if (Array.isArray(data)) return data;
      return data?.footage || [];
    }
  } catch {
    // Fall back
  }
  return null;
}

/**
 * Fetches AI pipeline status from GET /api/ai/status.
 */
export async function fetchAiStatus() {
  try {
    const res = await fetch(buildApiUrl('/api/ai/status'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await safeParseJsonResponse(res, 'AI Status');
    }
  } catch {
    // Fall back
  }
  return null;
}

/**
 * Sends a hardware capture command to the queue.
 * POST /api/device/commands/capture
 */
export async function triggerCaptureCommand() {
  const res = await fetch(buildApiUrl('/api/device/commands/capture'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Capture command failed (${res.status}): ${errText || res.statusText}`);
  }

  return await safeParseJsonResponse(res, 'Capture Command');
}

/**
 * Sends a recording command to the queue.
 * POST /api/device/commands/record
 */
export async function triggerRecordCommand(action = 'TOGGLE') {
  const res = await fetch(buildApiUrl('/api/device/commands/record'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Recording command failed (${res.status}): ${errText || res.statusText}`);
  }

  return await safeParseJsonResponse(res, 'Record Command');
}

/**
 * Backwards compatible manual capture trigger.
 */
export async function triggerManualCapture() {
  try {
    return await triggerCaptureCommand();
  } catch {
    // Try legacy /capture if edge gateway direct
    const res = await fetch(buildApiUrl('/capture'), {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Capture API failed (${res.status}): ${errText || res.statusText}`);
    }
    return await safeParseJsonResponse(res, 'Capture');
  }
}

export async function fetchConfig() {
  try {
    const res = await fetch(buildApiUrl('/config'), {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await safeParseJsonResponse(res, 'Config');
    }
  } catch {
    // Fallback
  }
  return null;
}

export async function saveConfig(configData) {
  const res = await fetch(buildApiUrl('/config'), {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(configData),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Save configuration failed (${res.status}): ${errText || res.statusText}`);
  }
  return await safeParseJsonResponse(res, 'Config');
}

export async function detectObjects(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');

  const res = await fetch(buildApiUrl('/detect'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Detection API error (${res.status}): ${errText || res.statusText}`);
  }

  return await safeParseJsonResponse(res, 'Detect');
}

export async function detectImageAnnotated(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');

  const res = await fetch(buildApiUrl('/detect-image'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Detection visual error: ${res.statusText}`);
  }

  return await res.blob();
}
