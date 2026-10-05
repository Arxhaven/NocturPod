/**
 * NocturPod API Service Layer
 * Connects frontend to the production Python backend (/api/* and /storage/*).
 * Provides graceful fallback handling when backend or edge device is offline.
 */

export const BACKEND_HOST = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_BASE = BACKEND_HOST ? `${BACKEND_HOST}/api` : '/api';

/**
 * Checks backend and device connectivity status.
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/device/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }
  } catch (err) {
    // Offline or network error
  }
  return { connected: false, error: 'NocturPod Backend Offline' };
}

/**
 * Fetches real-time hardware telemetry and device status.
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
 * Fetches events list with optional type filtering and search.
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
 * Fetches real still image captures with metadata and bounding boxes.
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
 * Fetches real recorded video clips list.
 */
export async function fetchFootage() {
  try {
    const res = await fetch(`${API_BASE}/media/footage`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch footage:", err);
  }
  return [];
}

/**
 * Fetches AI pipeline summary and model benchmarks.
 */
export async function fetchAiSummary() {
  try {
    const res = await fetch(`${API_BASE}/ai/summary`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch AI summary:", err);
  }
  return null;
}

/**
 * Fetches system metric aggregates.
 */
export async function fetchMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch metrics:", err);
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
 * Dispatches start/stop recording command to edge node.
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

/**
 * Sends image file/blob to backend YOLOv8n + Adaptive CLAHE engine.
 */
export async function detectObjects(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');

  const res = await fetch(`${API_BASE}/ai/infer`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Detection API error: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Sends image file/blob to receive annotated image with boxes.
 */
export async function detectImageAnnotated(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');

  const res = await fetch(`${API_BASE}/detect-image`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Detection visual error: ${res.statusText}`);
  }

  return await res.blob();
}

/**
 * Saves hardware preferences to edge device.
 */
export async function saveDeviceSettings(settings) {
  const res = await fetch(`${API_BASE}/device/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error(`Save settings error: ${res.statusText}`);
  }
  return await res.json();
}
