/**
 * AI inference execution handler.
 * Dispatches image to YOLO edge endpoint and rejects with honest error on failure.
 * Never injects delayed fake detections.
 */

export async function runEdgeInference(file, detectObjectsApi) {
  if (!file) {
    throw new Error('No image file provided for inference.');
  }

  if (typeof detectObjectsApi !== 'function') {
    throw new Error('Detection API is not configured.');
  }

  // Await the real backend response directly
  const result = await detectObjectsApi(file);
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid inference result received from backend.');
  }

  return {
    objects: Array.isArray(result.objects) ? result.objects : [],
    count: result.count ?? (result.objects ? result.objects.length : 0),
    imageDimensions: result.image_dimensions || null,
    simulated: false
  };
}
