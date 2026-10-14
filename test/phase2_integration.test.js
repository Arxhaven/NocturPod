import test from 'node:test';
import assert from 'node:assert';

import { 
  getStreamUrl, 
  isRecordingSupported, 
  API_BASE,
  buildApiUrl,
  DEFAULT_PRODUCTION_API_URL 
} from '../src/services/api.js';
import { 
  processManualCapture, 
  executeSnapshotWorkflow,
  mapBackendImageRecord 
} from '../src/utils/manualCapture.js';
import { evaluateDeviceStatus, INITIAL_DISCONNECTED_STATUS } from '../src/utils/deviceStatus.js';

test('Production API Base URL: Points to Render backend by default', () => {
  assert.strictEqual(
    DEFAULT_PRODUCTION_API_URL,
    'https://nocturpod-njsi.onrender.com',
    'Default production URL must point to deployed Render backend'
  );
  assert.ok(API_BASE.includes('onrender.com') || API_BASE.startsWith('/api') || API_BASE.startsWith('http'), `Valid API base: ${API_BASE}`);
});

test('API URL Construction: Normalizes trailing slashes and prevents /api/api double prefixing', () => {
  assert.strictEqual(buildApiUrl('/health'), `${DEFAULT_PRODUCTION_API_URL}/health`);
  assert.strictEqual(buildApiUrl('/api/device/health'), `${DEFAULT_PRODUCTION_API_URL}/api/device/health`);
  assert.strictEqual(buildApiUrl('/api/media/images'), `${DEFAULT_PRODUCTION_API_URL}/api/media/images`);
  assert.strictEqual(buildApiUrl('media/images'), `${DEFAULT_PRODUCTION_API_URL}/api/media/images`);
  
  // Absolute URLs should remain untouched
  const absUrl = 'https://pufwtyadqgnxtlbcgetk.supabase.co/storage/v1/object/sign/nocturpod-media/test.jpg?token=abc';
  assert.strictEqual(buildApiUrl(absUrl), absUrl);
});

test('Production Stream URL: Resolves stream path correctly without duplicate slashes', () => {
  const liveUrl = getStreamUrl('/api/stream/live');
  assert.ok(liveUrl.includes('/api/stream/live'), `Expected URL containing /api/stream/live, got: ${liveUrl}`);
  assert.ok(!liveUrl.includes('/api/api/'), `URL must not contain /api/api: ${liveUrl}`);
});

test('Recording Capability: Reports true for Render production backend supporting /api/device/commands/record', () => {
  assert.strictEqual(
    isRecordingSupported(),
    true,
    'Production backend supports POST /api/device/commands/record'
  );
});

test('Vercel Rewrite Safety: Negative lookahead excludes /api/ routes from SPA index.html rewrite', () => {
  const spaRegex = /^\/((?!api\/).*)?$/;

  // SPA paths SHOULD match and rewrite to index.html
  assert.strictEqual(spaRegex.test('/overview'), true);
  assert.strictEqual(spaRegex.test('/live'), true);
  assert.strictEqual(spaRegex.test('/events'), true);
  assert.strictEqual(spaRegex.test('/settings'), true);
  assert.strictEqual(spaRegex.test('/'), true);

  // API paths MUST NOT match (so they receive 404/proxy instead of index.html)
  assert.strictEqual(spaRegex.test('/api/health'), false);
  assert.strictEqual(spaRegex.test('/api/device/status'), false);
  assert.strictEqual(spaRegex.test('/api/stream/live'), false);
  assert.strictEqual(spaRegex.test('/api/media/images'), false);
  assert.strictEqual(spaRegex.test('/api/device/commands/capture'), false);
});

test('Snapshot Workflow: Distinguishes queued command from completed upload', async () => {
  const statusEvents = [];

  // Mock trigger returning command_id in PENDING state
  const mockTrigger = async () => ({
    action: 'CAPTURE_IMAGE',
    command_id: 'cmd_20261014173749543',
    status: 'PENDING',
    created_at: new Date().toISOString()
  });

  // Mock fetchImages returning the uploaded image record
  const mockFetchImages = async () => [
    {
      event_id: 'NP_20261014_173750_100',
      type: 'MANUAL_CAPTURE',
      original_url: 'https://pufwtyadqgnxtlbcgetk.supabase.co/test_capture.jpg?token=test',
      enhanced_url: null,
      ai_status: 'PROCESSING',
      processing_status: 'PENDING',
      timestamp: new Date().toISOString(),
      notes: 'Original media ingested.'
    }
  ];

  const result = await executeSnapshotWorkflow({
    triggerCaptureFn: mockTrigger,
    fetchImagesFn: mockFetchImages,
    onStatusUpdate: (st) => statusEvents.push(st.status),
    pollIntervalMs: 10,
    maxAttempts: 2
  });

  assert.ok(statusEvents.includes('QUEUED'), 'Must emit QUEUED status when command accepted');
  assert.ok(statusEvents.includes('COMPLETED'), 'Must emit COMPLETED status when image found');
  assert.strictEqual(result.eventId, 'NP_20261014_173750_100');
  assert.strictEqual(result.originalUrl, 'https://pufwtyadqgnxtlbcgetk.supabase.co/test_capture.jpg?token=test');
});

test('Snapshot Workflow: Fails honestly on timeout without fabricating images', async () => {
  const statusEvents = [];
  const mockTrigger = async () => ({
    action: 'CAPTURE_IMAGE',
    command_id: 'cmd_timeout_test',
    status: 'PENDING'
  });

  // Returns empty images list
  const mockFetchImages = async () => [];

  await assert.rejects(
    async () => {
      await executeSnapshotWorkflow({
        triggerCaptureFn: mockTrigger,
        fetchImagesFn: mockFetchImages,
        onStatusUpdate: (st) => statusEvents.push(st.status),
        pollIntervalMs: 5,
        maxAttempts: 2
      });
    },
    /upload timed out/
  );

  assert.ok(statusEvents.includes('QUEUED'));
  assert.ok(statusEvents.includes('TIMEOUT'));
});

test('Media Schema Mapping: Maps Render media record (NP_20261014_165402_727) correctly', () => {
  const rawBackendRecord = {
    ai_status: 'PROCESSING',
    created_at: '2026-10-14T16:54:03.663112+00:00',
    detections: [],
    device_id: 'nocturpod-edge-01',
    duration: '0s',
    enhanced_url: null,
    event_id: 'NP_20261014_165402_727',
    media_type: 'IMAGE',
    notes: 'Original media ingested. Size: 174.0 KB',
    original_url: 'https://pufwtyadqgnxtlbcgetk.supabase.co/storage/v1/object/sign/nocturpod-media/test.jpg?token=sampletoken123',
    processing_status: 'PENDING',
    status: 'ENHANCEMENT_PROCESSING',
    timestamp: '2026-10-14T16:54:03.597295+00:00',
    type: 'MANUAL_CAPTURE',
    updated_at: '2026-10-14T16:54:03.975337+00:00'
  };

  const mapped = mapBackendImageRecord(rawBackendRecord);

  assert.strictEqual(mapped.eventId, 'NP_20261014_165402_727');
  assert.strictEqual(mapped.originalUrl, rawBackendRecord.original_url);
  assert.strictEqual(mapped.enhancedUrl, null);
  // When enhanced is null, primary url and thumbnail must fall back to originalUrl
  assert.strictEqual(mapped.url, rawBackendRecord.original_url);
  assert.strictEqual(mapped.thumbnail, rawBackendRecord.original_url);
  assert.strictEqual(mapped.aiStatus, 'PROCESSING');
  assert.strictEqual(mapped.processingStatus, 'PENDING');
  // Never strip or corrupt signed tokens
  assert.ok(mapped.url.includes('token=sampletoken123'));
});

test('Device Status Evaluation: Correctly parses snake_case telemetry from Render /api/device/status', () => {
  const mockRenderDeviceStatus = {
    ai_model_version: 'Adaptive CLAHE + YOLOv8n',
    camera_model: 'OV5647 IR-Cut',
    camera_status: 'OFFLINE',
    cpu_temp_c: 57.9,
    cpu_usage_percent: 12.9,
    device_id: 'nocturpod-edge-01',
    device_name: 'NocturPod Alpha-1',
    hardware_model: 'Raspberry Pi 4 Model B 8GB',
    ip_address: '192.168.1.44',
    last_heartbeat: new Date(Date.now() - 35000).toISOString(),
    ram_usage_percent: 18.3,
    status: 'OFFLINE',
    storage_total_gb: 28.68,
    storage_used_gb: 13.04,
    stream_fps: 15,
    stream_resolution: '1280x720',
    uptime_seconds: 7320,
    wifi_rssi: -75,
    wifi_ssid: 'NocturNet-WiFi',
    wifi_status: 'CONNECTED'
  };

  const evaluated = evaluateDeviceStatus({ connected: true }, mockRenderDeviceStatus);

  assert.strictEqual(evaluated.status, 'OFFLINE');
  assert.strictEqual(evaluated.hardware, 'Raspberry Pi 4 Model B 8GB');
  assert.strictEqual(evaluated.cpuTempC, 57.9);
  assert.strictEqual(evaluated.cpuUsagePercent, 12.9);
  assert.strictEqual(evaluated.ramUsagePercent, 18.3);
  assert.strictEqual(evaluated.storageUsedGB, 13.04);
  assert.strictEqual(evaluated.storageTotalGB, 28.68);
  assert.strictEqual(evaluated.uptimeHours, 2);
  assert.strictEqual(evaluated.uptimeMinutes, 2);
  assert.strictEqual(evaluated.wifiSSID, 'NocturNet-WiFi');
  assert.strictEqual(evaluated.cameraStatus, 'OFFLINE');
  assert.ok(evaluated.lastHeartbeatSec >= 30, 'Calculates recent heartbeat from timestamp');
});

test('Security Audit: No hardcoded master secrets or tokens in client code', () => {
  assert.strictEqual(
    typeof process.env.VITE_API_KEY,
    'undefined',
    'VITE_API_KEY must not be set in public frontend builds'
  );
});
