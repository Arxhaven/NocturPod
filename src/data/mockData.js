/**
 * NocturPod Neutral Initial State
 * Strictly represents empty / offline state before backend telemetry is received.
 * Contains NO fabricated hardware metrics, fake FPS, fake temperatures, or simulated values.
 */

export const EMPTY_DEVICE_STATUS = {
  device_id: null,
  device_name: null,
  hardware_model: null,
  camera_model: null,
  status: 'OFFLINE',
  camera_status: 'OFFLINE',
  wifi_status: 'OFFLINE',
  wifi_ssid: null,
  wifi_rssi: null,
  ip_address: null,
  storage_used_gb: null,
  storage_total_gb: null,
  cpu_temp_c: null,
  cpu_usage_percent: null,
  ram_usage_percent: null,
  uptime_seconds: null,
  software_version: null,
  ai_model_version: null,
  stream_fps: null,
  stream_resolution: null,
  last_heartbeat: null
};

export const HARDWARE_SPECIFICATIONS = {
  architecture: "Broadcom BCM2711, Quad core Cortex-A72 (ARM v8) 64-bit SoC @ 1.8GHz",
  model: "Raspberry Pi 4 Model B (8GB RAM)",
  cameraSensor: "OmniVision OV5647 (5MP CMOS, Fixed Focus, M12 Mount)",
  irCutFilter: "Mechanical IR-Cut switch with 850nm dual IR LEDs",
  pipeline: "Picamera2 / libcamera native edge agent pipeline",
  backendHost: "Render Linux Environment (Gunicorn/Flask with Async AI Worker)",
  database: "Supabase PostgreSQL & Supabase S3-Compatible Storage"
};
