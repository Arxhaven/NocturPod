/**
 * Device connection status & telemetry evaluation utility.
 * Enforces honest device connection states without fabricating telemetry or heartbeats.
 */

export const INITIAL_DISCONNECTED_STATUS = {
  id: 'nocturpod-edge-01',
  name: 'NocturPod α-1',
  hardware: 'Raspberry Pi 4 Model B (Pending)',
  cameraModel: 'OV5647 CSI Camera (Pending)',
  pirSensor: 'HC-SR501 / AM312 PIR (Pending)',
  status: 'DISCONNECTED', // DISCONNECTED, CONNECTING, OFFLINE, ONLINE, ERROR
  cameraStatus: 'UNKNOWN',
  pirStatus: 'UNKNOWN',
  wifiStatus: 'UNKNOWN',
  wifiSSID: null,
  wifiRssi: null,
  ipAddress: null,
  storageUsedGB: null,
  storageTotalGB: null,
  batteryPercent: null,
  batteryVoltage: null,
  powerSource: 'UNKNOWN',
  cpuTempC: null,
  cpuUsagePercent: null,
  ramUsagePercent: null,
  uptimeHours: null,
  uptimeMinutes: null,
  lastHeartbeatSec: null,
  streamFps: null,
  streamResolution: '1280x720',
  claheEnabled: true,
  irNightMode: 'UNKNOWN',
  telemetryVerified: false,
};

export const INITIAL_BLANK_METRICS = {
  motionEventsToday: 0,
  capturesToday: 0,
  recordedMinutesToday: 0,
  aiDetectionsToday: 0,
  uptimeStr: 'N/A',
  healthScore: 'N/A'
};

/**
 * Evaluates honest device status based on backend health and telemetry.
 * Normalizes snake_case backend keys (e.g. cpu_temp_c) to camelCase.
 * Never marks camera or PIR as ONLINE unless physical telemetry verifies it.
 */
export function evaluateDeviceStatus(healthResult, telemetryData, currentStatus = INITIAL_DISCONNECTED_STATUS) {
  if (!healthResult || !healthResult.connected) {
    return {
      ...currentStatus,
      status: 'OFFLINE',
      cameraStatus: 'UNKNOWN',
      pirStatus: 'UNKNOWN',
      wifiStatus: 'OFFLINE',
      lastHeartbeatSec: null,
      errorMessage: healthResult?.error || 'NocturPod backend unreachable',
      telemetryVerified: false,
    };
  }

  // Backend is reachable
  if (telemetryData && typeof telemetryData === 'object') {
    // Calculate heartbeat elapsed seconds if last_heartbeat timestamp is provided
    let calculatedHeartbeatSec = telemetryData.lastHeartbeatSec;
    if (calculatedHeartbeatSec == null && telemetryData.last_heartbeat) {
      try {
        const hbTime = new Date(telemetryData.last_heartbeat).getTime();
        if (!isNaN(hbTime)) {
          calculatedHeartbeatSec = Math.max(0, Math.floor((Date.now() - hbTime) / 1000));
        }
      } catch {
        calculatedHeartbeatSec = null;
      }
    }

    // Calculate uptime hours/minutes
    let uptimeHours = telemetryData.uptimeHours;
    let uptimeMinutes = telemetryData.uptimeMinutes;
    if (uptimeHours == null && typeof telemetryData.uptime_seconds === 'number') {
      uptimeHours = Math.floor(telemetryData.uptime_seconds / 3600);
      uptimeMinutes = Math.floor((telemetryData.uptime_seconds % 3600) / 60);
    }

    return {
      ...currentStatus,
      ...telemetryData,
      id: telemetryData.device_id || telemetryData.id || currentStatus.id,
      name: telemetryData.device_name || telemetryData.name || currentStatus.name,
      hardware: telemetryData.hardware_model || telemetryData.hardware || currentStatus.hardware,
      cameraModel: telemetryData.camera_model || telemetryData.cameraModel || currentStatus.cameraModel,
      cameraStatus: telemetryData.camera_status || telemetryData.cameraStatus || 'UNKNOWN',
      pirStatus: telemetryData.pir_sensor_status || telemetryData.pirStatus || 'UNKNOWN',
      wifiStatus: telemetryData.wifi_status || telemetryData.wifiStatus || currentStatus.wifiStatus,
      wifiSSID: telemetryData.wifi_ssid || telemetryData.wifiSSID || null,
      wifiRssi: telemetryData.wifi_rssi ?? telemetryData.wifiRssi ?? null,
      ipAddress: telemetryData.ip_address || telemetryData.ipAddress || currentStatus.ipAddress,
      storageUsedGB: telemetryData.storage_used_gb ?? telemetryData.storageUsedGB ?? null,
      storageTotalGB: telemetryData.storage_total_gb ?? telemetryData.storageTotalGB ?? null,
      cpuTempC: telemetryData.cpu_temp_c ?? telemetryData.cpuTempC ?? null,
      cpuUsagePercent: telemetryData.cpu_usage_percent ?? telemetryData.cpuUsagePercent ?? null,
      ramUsagePercent: telemetryData.ram_usage_percent ?? telemetryData.ramUsagePercent ?? null,
      streamFps: telemetryData.stream_fps ?? telemetryData.streamFps ?? null,
      streamResolution: telemetryData.stream_resolution || telemetryData.streamResolution || '1280x720',
      uptimeHours,
      uptimeMinutes,
      lastHeartbeatSec: calculatedHeartbeatSec ?? telemetryData.lastHeartbeatSec ?? null,
      status: telemetryData.status || (healthResult.connected ? 'ONLINE' : 'OFFLINE'),
      errorMessage: null,
      telemetryVerified: true,
    };
  }

  // Backend HTTP responded, but no specific device record returned
  return {
    ...currentStatus,
    status: 'ONLINE',
    cameraStatus: 'UNKNOWN',
    pirStatus: 'UNKNOWN',
    lastHeartbeatSec: null,
    errorMessage: null,
    telemetryVerified: false,
  };
}

/**
 * Returns formatted heartbeat string backed strictly by real data.
 */
export function formatHeartbeat(status, lastHeartbeatSec) {
  if (status !== 'ONLINE' || lastHeartbeatSec == null) {
    return 'NO SIGNAL';
  }
  if (lastHeartbeatSec < 60) {
    return `${lastHeartbeatSec}s ago`;
  }
  const mins = Math.floor(lastHeartbeatSec / 60);
  return `${mins}m ago`;
}
