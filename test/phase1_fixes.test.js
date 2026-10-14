import test from 'node:test';
import assert from 'node:assert';

import { resolveEventMedia } from '../src/utils/eventSelection.js';
import { safeFootageFilter, formatFootageAi } from '../src/utils/footageSearch.js';
import {
  INITIAL_DISCONNECTED_STATUS,
  evaluateDeviceStatus,
  formatHeartbeat
} from '../src/utils/deviceStatus.js';
import { processManualCapture } from '../src/utils/manualCapture.js';
import { runEdgeInference } from '../src/utils/aiInference.js';

test('Device Status: Initializes as DISCONNECTED, not ONLINE', () => {
  assert.strictEqual(INITIAL_DISCONNECTED_STATUS.status, 'DISCONNECTED');
  assert.strictEqual(INITIAL_DISCONNECTED_STATUS.cameraStatus, 'UNKNOWN');
  assert.strictEqual(INITIAL_DISCONNECTED_STATUS.pirStatus, 'UNKNOWN');
  assert.strictEqual(INITIAL_DISCONNECTED_STATUS.lastHeartbeatSec, null);
});

test('Device Status: Evaluates to OFFLINE when health check fails', () => {
  const healthFailed = { connected: false, error: 'Connection refused on :5000' };
  const status = evaluateDeviceStatus(healthFailed, null);

  assert.strictEqual(status.status, 'OFFLINE');
  assert.strictEqual(status.cameraStatus, 'UNKNOWN');
  assert.strictEqual(status.pirStatus, 'UNKNOWN');
  assert.strictEqual(status.lastHeartbeatSec, null);
  assert.ok(status.errorMessage.includes('Connection refused'));
});

test('Device Status: Never assumes camera/PIR are ONLINE just because HTTP responds', () => {
  const healthOk = { connected: true };
  // Telemetry endpoint unavailable or unverified
  const status = evaluateDeviceStatus(healthOk, null);

  assert.strictEqual(status.status, 'ONLINE');
  assert.strictEqual(status.cameraStatus, 'UNKNOWN');
  assert.strictEqual(status.pirStatus, 'UNKNOWN');
});

test('Heartbeat: Never displays fake heartbeat when offline or null', () => {
  assert.strictEqual(formatHeartbeat('OFFLINE', null), 'NO SIGNAL');
  assert.strictEqual(formatHeartbeat('OFFLINE', 2), 'NO SIGNAL');
  assert.strictEqual(formatHeartbeat('ONLINE', null), 'NO SIGNAL');
  assert.strictEqual(formatHeartbeat('ONLINE', 4), '4s ago');
});

test('Manual Capture: Rejects cleanly on failure without fabricating mock images', async () => {
  const mockFailingCaptureApi = async () => {
    throw new Error('Network error: Edge device timed out');
  };

  await assert.rejects(
    async () => {
      await processManualCapture(mockFailingCaptureApi, (url) => url);
    },
    {
      name: 'Error',
      message: 'Network error: Edge device timed out'
    }
  );
});

test('Manual Capture: Returns formatted payload on successful capture', async () => {
  const mockSuccessCaptureApi = async () => ({
    status: 'ok',
    image_id: 'img-12345',
    url: '/api/media/12345.jpg',
    timestamp: '2026-10-14 12:00:00'
  });

  const result = await processManualCapture(mockSuccessCaptureApi, (url) => `http://localhost:5000${url}`);
  assert.strictEqual(result.id, 'img-12345');
  assert.strictEqual(result.url, 'http://localhost:5000/api/media/12345.jpg');
});

test('AI Inference: Rejects with honest error without delayed fake detection fallback', async () => {
  const mockFailingDetectApi = async () => {
    throw new Error('503 Service Unavailable: YOLO model not loaded on edge node');
  };

  await assert.rejects(
    async () => {
      await runEdgeInference(new Blob(['test']), mockFailingDetectApi);
    },
    {
      name: 'Error',
      message: '503 Service Unavailable: YOLO model not loaded on edge node'
    }
  );
});

test('Footage Search: Safe against null or missing camera, title, or timestamp', () => {
  const clipsWithMissingFields = [
    { id: 'v1', title: null, timestamp: null, camera: null, aiTag: null },
    { id: 'v2', title: 'Perimeter Gate', timestamp: '2026-10-14', camera: 'OV5647', aiTag: 'Person' }
  ];

  // Must not throw TypeError
  assert.doesNotThrow(() => {
    const results = safeFootageFilter(clipsWithMissingFields, 'ALL', 'perimeter');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'v2');
  });

  assert.doesNotThrow(() => {
    const results = safeFootageFilter(clipsWithMissingFields, 'ALL', 'ov5647');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'v2');
  });
});

test('Footage AI Format: Never outputs literal "undefined"', () => {
  const clipWithoutAi = { id: 'v1' };
  const clipWithUndefinedStr = { id: 'v2', aiTag: 'undefined', confidence: 'undefined' };
  const clipWithValidAi = { id: 'v3', aiTag: 'Vehicle', confidence: 0.884 };

  const res1 = formatFootageAi(clipWithoutAi);
  assert.strictEqual(res1.tagText, 'Unclassified');
  assert.strictEqual(res1.hasTag, false);

  const res2 = formatFootageAi(clipWithUndefinedStr);
  assert.strictEqual(res2.tagText, 'Unclassified');

  const res3 = formatFootageAi(clipWithValidAi);
  assert.strictEqual(res3.tagText, 'Vehicle (88.4%)');
  assert.strictEqual(res3.hasTag, true);
});

test('Event Selection: Selects matching event media rather than default [0]', () => {
  const mockImages = [
    { id: 'img-1', url: 'http://media/1.jpg' },
    { id: 'img-2', url: 'http://media/2.jpg' },
    { id: 'img-3', url: 'http://media/3.jpg' }
  ];

  const mockFootage = [
    { id: 'vid-1', videoUrl: 'http://media/1.mp4' },
    { id: 'vid-2', videoUrl: 'http://media/2.mp4' }
  ];

  // 1. Select event-2 image
  const evtImage2 = { id: 'img-2', mediaType: 'IMAGE', label: 'Bicycle detected' };
  const resImage = resolveEventMedia(evtImage2, mockImages, mockFootage);
  assert.strictEqual(resImage.found, true);
  assert.strictEqual(resImage.media.id, 'img-2'); // Must NOT be img-1 (images[0])

  // 2. Select event-2 video
  const evtVideo2 = { id: 'vid-2', mediaType: 'VIDEO', label: 'Car passing', fullMediaUrl: 'http://media/2.mp4' };
  const resVideo = resolveEventMedia(evtVideo2, mockImages, mockFootage);
  assert.strictEqual(resVideo.found, true);
  assert.strictEqual(resVideo.media.id, 'vid-2'); // Must NOT be vid-1 (footage[0])

  // 3. Select unlisted event that has fullMediaUrl
  const evtUnlisted = { id: 'img-99', mediaType: 'IMAGE', label: 'New capture', fullMediaUrl: 'http://media/99.jpg' };
  const resUnlisted = resolveEventMedia(evtUnlisted, mockImages, mockFootage);
  assert.strictEqual(resUnlisted.found, true);
  assert.strictEqual(resUnlisted.media.url, 'http://media/99.jpg');

  // 4. Select event with completely missing media
  const evtMissing = { id: 'evt-empty', mediaType: 'VIDEO', label: 'Empty' };
  const resMissing = resolveEventMedia(evtMissing, mockImages, mockFootage);
  assert.strictEqual(resMissing.found, false);
  assert.ok(resMissing.error.includes('unavailable'));
});
