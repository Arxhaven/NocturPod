/**
 * Manual capture workflow and media mapping utility.
 * Interfaces with the production command queue and image storage endpoints.
 * Never fabricates mock images, placeholder photos, or fake success states.
 */

/**
 * Normalizes backend image records from GET /api/media/images to the frontend schema.
 * Handles both original Supabase signed URLs and enhanced URLs.
 */
export function mapBackendImageRecord(img, resolveMediaUrlFn = (u) => u) {
  if (!img) return null;
  const eventId = img.event_id || img.eventId || img.id || `img-${Date.now()}`;
  const rawOriginalUrl = img.original_url || img.originalUrl || img.url || '';
  const rawEnhancedUrl = img.enhanced_url || img.enhancedUrl || null;

  const originalUrl = rawOriginalUrl ? resolveMediaUrlFn(rawOriginalUrl) : '';
  const enhancedUrl = rawEnhancedUrl ? resolveMediaUrlFn(rawEnhancedUrl) : null;

  // Use enhanced URL if available, otherwise original URL
  const primaryUrl = enhancedUrl || originalUrl;

  const rawTimestamp = img.timestamp || img.created_at || new Date().toISOString();
  let formattedTime = rawTimestamp;
  try {
    const d = new Date(rawTimestamp);
    if (!isNaN(d.getTime())) {
      formattedTime = d.toISOString().replace('T', ' ').slice(0, 19);
    }
  } catch {
    // Keep raw
  }

  const detections = Array.isArray(img.detections) ? img.detections : [];
  const primaryDetection = detections[0] || null;

  return {
    id: eventId,
    eventId: eventId,
    title: img.notes || (img.type === 'MANUAL_CAPTURE' ? 'Manual Camera Snapshot' : 'PIR Motion Triggered'),
    timestamp: formattedTime,
    originalTimestamp: rawTimestamp,
    resolution: img.resolution || '1280×720 (OV5647)',
    iso: img.iso || 'ISO 1600 (Night Mode)',
    shutter: img.shutter || '1/30s',
    url: primaryUrl,
    thumbnail: primaryUrl,
    originalUrl,
    enhancedUrl,
    aiStatus: img.ai_status || 'PENDING',
    processingStatus: img.processing_status || (enhancedUrl ? 'COMPLETED' : 'PENDING'),
    status: img.status || 'INGESTED',
    type: img.type || 'MANUAL_CAPTURE',
    mediaType: img.media_type || 'IMAGE',
    deviceId: img.device_id || 'nocturpod-edge-01',
    claheApplied: Boolean(enhancedUrl || (img.notes && img.notes.includes('CLAHE'))),
    aiTag: primaryDetection?.label || (img.type === 'MANUAL_CAPTURE' ? 'Manual' : 'Optical Capture'),
    confidence: primaryDetection?.confidence ?? null,
    boundingBoxes: detections,
    notes: img.notes || '',
  };
}

/**
 * Executes manual capture command and polls backend for the uploaded media record.
 */
export async function executeSnapshotWorkflow({
  triggerCaptureFn,
  fetchImagesFn,
  resolveMediaUrlFn = (u) => u,
  onStatusUpdate,
  pollIntervalMs = 2500,
  maxAttempts = 10,
}) {
  if (typeof triggerCaptureFn !== 'function') {
    throw new Error('Capture API function is required.');
  }

  const startTime = Date.now();
  const cmdResponse = await triggerCaptureFn();

  // 1. Direct edge gateway capture response (e.g. { status: 'ok', url: '...' })
  if (cmdResponse && cmdResponse.status === 'ok' && cmdResponse.url) {
    return mapBackendImageRecord(cmdResponse, resolveMediaUrlFn);
  }

  // 2. Asynchronous command queue response (e.g. { command_id: 'cmd_...', status: 'PENDING' })
  const commandId = cmdResponse?.command_id;
  if (!commandId) {
    throw new Error(cmdResponse?.error || 'Edge gateway rejected capture command.');
  }

  if (onStatusUpdate) {
    onStatusUpdate({
      status: 'QUEUED',
      commandId,
      message: `Command [${commandId}] queued. Waiting for Raspberry Pi upload...`,
    });
  }

  if (typeof fetchImagesFn !== 'function') {
    return {
      id: commandId,
      commandId,
      status: 'QUEUED',
      timestamp: new Date().toISOString(),
    };
  }

  // Poll for uploaded image
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    if (onStatusUpdate) {
      onStatusUpdate({
        status: 'POLLING',
        commandId,
        attempt,
        maxAttempts,
        message: `Waiting for edge upload (Attempt ${attempt}/${maxAttempts})...`,
      });
    }

    try {
      const images = await fetchImagesFn();
      if (Array.isArray(images) && images.length > 0) {
        // Look for any image created at or after the command trigger time
        const newImage = images.find((img) => {
          const imgTime = new Date(img.created_at || img.timestamp).getTime();
          return !isNaN(imgTime) && imgTime >= startTime - 6000;
        }) || images[0];

        const imgTime = new Date(newImage.created_at || newImage.timestamp).getTime();
        // Check if image is reasonably recent
        if (!isNaN(imgTime) && imgTime >= startTime - 6000) {
          const mapped = mapBackendImageRecord(newImage, resolveMediaUrlFn);
          if (onStatusUpdate) {
            onStatusUpdate({
              status: 'COMPLETED',
              commandId,
              image: mapped,
              message: `Snapshot received from edge device (${mapped.id}).`,
            });
          }
          return mapped;
        }
      }
    } catch {
      // Continue polling on transient errors
    }
  }

  // Polling timed out
  if (onStatusUpdate) {
    onStatusUpdate({
      status: 'TIMEOUT',
      commandId,
      message: `Capture command [${commandId}] was queued, but edge camera upload timed out.`,
    });
  }

  throw new Error(`Capture command [${commandId}] was queued, but device upload timed out. Ensure the Raspberry Pi agent is running.`);
}

/**
 * Standard interface for manual capture.
 * Preserves backwards compatibility for existing unit tests.
 */
export async function processManualCapture(triggerApiFn, resolveMediaUrlFn, claheActive = false) {
  if (typeof triggerApiFn !== 'function') {
    throw new Error('Capture API function is required.');
  }

  const res = await triggerApiFn();
  if (!res) {
    throw new Error('Edge camera capture failed: empty response.');
  }

  // Direct return
  if (res.status === 'ok' && res.url) {
    const fullUrl = resolveMediaUrlFn ? resolveMediaUrlFn(res.url) : res.url;
    return {
      id: res.image_id || `img-${Date.now().toString().slice(-4)}`,
      title: 'Edge Frame (Hardware Snapshot)',
      timestamp: res.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19),
      resolution: '1920×1080',
      iso: 'ISO 1600 (IR Active)',
      shutter: '1/40s',
      url: fullUrl,
      thumbnail: fullUrl,
      aiTag: 'Triggered',
      confidence: null,
      eventId: res.image_id ? `evt-${res.image_id.slice(-4)}` : null,
      claheApplied: claheActive,
      boundingBoxes: [],
    };
  }

  // Queued command
  if (res.command_id) {
    return {
      id: res.command_id,
      commandId: res.command_id,
      status: 'QUEUED',
      timestamp: res.created_at || new Date().toISOString(),
      claheApplied: claheActive,
    };
  }

  throw new Error(res.error || 'Edge camera capture failed: invalid response.');
}
