/**
 * NocturPod Empty Production Fallbacks
 * Used ONLY when backend is unreachable or returning empty data.
 * No hardcoded fake hardware metrics, simulated battery, or fake stream telemetry.
 */

export const EMPTY_DEVICE_STATUS = {
  id: "nocturpod-edge-01",
  name: "NocturPod Alpha-1",
  hardware_model: "Raspberry Pi 4 Model B 8GB",
  camera_model: "OV5647 IR-Cut",
  status: "OFFLINE",
  camera_status: "OFFLINE",
  wifi_status: "DISCONNECTED",
  wifi_ssid: null,
  wifi_rssi: null,
  ip_address: null,
  storage_used_gb: null,
  storage_total_gb: null,
  cpu_temp_c: null,
  cpu_usage_percent: null,
  ram_usage_percent: null,
  uptime_seconds: null,
  software_version: "1.0.0",
  ai_model_version: "Adaptive CLAHE + YOLOv8n",
  stream_fps: 0,
  stream_resolution: "1280x720",
  last_heartbeat: null
};

export const EMPTY_METRICS = {
  capturesToday: 0,
  recordingsToday: 0,
  enhancementsCompleted: 0
};
