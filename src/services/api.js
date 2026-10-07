/**
 * NocturPod Production API Service Layer
 * Connects frontend to the production backend specified by VITE_API_URL.
 */

export const BACKEND_HOST =
  (import.meta.env.VITE_API_URL || 'https://nocturpod-njsi.onrender.com')
    .replace(/\/$/, '');
export const API_BASE = `${BACKEND_HOST}/api`;

export function resolveMediaUrl(url) {
  if (!url) return null;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return `${BACKEND_HOST}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Checks backend and edge device connectivity status.
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/device/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }
  } catch (err) {
    // Backend offline or network error
  }
  return { connected: false, error: 'NocturPod Backend Offline' };
}

/**
 * Fetches real hardware telemetry and device status.
 */
export async function fetchDeviceStatus() {
  try {
    const res = await fetch(`${API_BASE}/device/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch device status:", err);
  }
  return null;
}

/**
 * Fetches events list from backend / Supabase.
 */
export async function fetchEvents(filter = 'ALL', search = '') {
  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'ALL') params.append('filter', filter);
    if (search && search.trim()) params.append('search', search.trim());
    
    const res = await fetch(`${API_BASE}/events?${params.toString()}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch events:", err);
  }
  return [];
}

/**
 * Fetches still image captures (both Original and Enhanced variants).
 */
export async function fetchImages() {
  try {
    const res = await fetch(`${API_BASE}/media/images`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch images:", err);
  }
  return [];
}

/**
 * Fetches video recordings (both Original and Enhanced variants).
 */
export async function fetchFootage() {
  try {
    const res = await fetch(`${API_BASE}/media/footage`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch recordings:", err);
  }
  return [];
}

/**
 * Fetches AI enhancement pipeline and vision model status.
 */
export async function fetchAiStatus() {
  try {
    const res = await fetch(`${API_BASE}/ai/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch AI status:", err);
  }
  return null;
}

/**
 * Fetches live stream status (true FPS, resolution, online/standby).
 */
export async function fetchStreamStatus() {
  try {
    const res = await fetch(`${API_BASE}/stream/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch stream status:", err);
  }
  return null;
}

/**
 * Dispatches still frame snapshot command to edge Raspberry Pi node.
 */
export async function triggerSnapshot() {
  const res = await fetch(`${API_BASE}/device/commands/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Capture command error: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Dispatches start/stop recording command to edge Raspberry Pi node.
 */
export async function toggleRecording(isRecording) {
  const res = await fetch(`${API_BASE}/device/commands/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording: isRecording }),
  });
  if (!res.ok) {
    throw new Error(`Record command error: ${res.statusText}`);
  }
  return await res.json();
}
