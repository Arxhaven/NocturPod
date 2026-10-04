/**
 * NocturPod API Service Layer
 * Seamlessly talks to api_server.py endpoints (/health, /detect, /detect-image)
 * and falls back gracefully or uses edge mock inference if backend is offline.
 */

export const API_BASE = '/api'; // proxied to http://127.0.0.1:5000 in Vite

export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }
  } catch (err) {
    // Backend offline or timeout
  }
  return { connected: false, error: 'Local Python AI Server (api_server.py) not running on port 5000' };
}

/**
 * Sends image file/blob to real Python YOLO server: POST /detect
 * Returns detected bounding boxes, labels, and confidences.
 */
export async function detectObjects(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');

  const res = await fetch(`${API_BASE}/detect`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Detection API error: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Sends image file/blob to real Python YOLO server: POST /detect-image
 * Returns annotated image Blob with bounding boxes plotted.
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
