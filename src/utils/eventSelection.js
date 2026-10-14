/**
 * Safe event media resolution utility.
 * Prevents opening footage[0] or images[0] and handles missing media gracefully.
 */

export function resolveEventMedia(evt, images = [], footage = []) {
  if (!evt || typeof evt !== 'object') {
    return { found: false, error: 'Invalid event' };
  }

  const isVideo = evt.mediaType === 'VIDEO';

  if (isVideo) {
    // 1. Try to find a matching clip in footage array by fullMediaUrl, id, or thumbnail
    const matched = footage.find(
      (f) =>
        (f.id && f.id === evt.id) ||
        (evt.fullMediaUrl && f.videoUrl === evt.fullMediaUrl) ||
        (evt.thumbnail && f.thumbnail === evt.thumbnail)
    );

    if (matched) {
      return { mediaType: 'VIDEO', found: true, media: matched };
    }

    // 2. If not in the loaded footage array, but event itself carries fullMediaUrl
    if (evt.fullMediaUrl) {
      return {
        mediaType: 'VIDEO',
        found: true,
        media: {
          id: evt.id || `vid-${Date.now()}`,
          title: evt.label || `Recorded Event ${evt.id}`,
          timestamp: evt.timestamp || '',
          duration: evt.duration || 'N/A',
          resolution: '1920×1080',
          fileSize: 'N/A',
          camera: 'OV5647 IR-Cut',
          videoUrl: evt.fullMediaUrl,
          thumbnail: evt.thumbnail || '',
          detections: Array.isArray(evt.detections)
            ? evt.detections.map((d) => `${d.label} (${d.confidence})`)
            : []
        }
      };
    }

    // 3. Media is unavailable
    return {
      mediaType: 'VIDEO',
      found: false,
      error: `Video footage for event ${evt.id || ''} is unavailable.`
    };
  }

  // Image media handling
  const matchedImage = images.find(
    (img) =>
      (img.id && img.id === evt.id) ||
      (evt.fullMediaUrl && img.url === evt.fullMediaUrl) ||
      (evt.thumbnail && (img.thumbnail === evt.thumbnail || img.url === evt.thumbnail))
  );

  if (matchedImage) {
    return { mediaType: 'IMAGE', found: true, media: matchedImage };
  }

  const targetUrl = evt.fullMediaUrl || evt.thumbnail;
  if (targetUrl) {
    return {
      mediaType: 'IMAGE',
      found: true,
      media: {
        id: evt.id || `img-${Date.now()}`,
        title: evt.label || `Capture for ${evt.id}`,
        timestamp: evt.timestamp || '',
        resolution: '1920×1080',
        iso: 'ISO 1600',
        shutter: '1/40s',
        url: targetUrl,
        thumbnail: evt.thumbnail || targetUrl,
        aiTag: evt.label || 'Detection',
        confidence: evt.confidence,
        eventId: evt.id,
        claheApplied: true,
        boundingBoxes: Array.isArray(evt.detections) ? evt.detections : []
      }
    };
  }

  return {
    mediaType: 'IMAGE',
    found: false,
    error: `Image capture for event ${evt.id || ''} is unavailable.`
  };
}
