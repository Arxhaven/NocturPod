import React from 'react';
import StatusBadge from '../components/StatusBadge';
import { 
  HardDrive, 
  Cpu, 
  Camera, 
  Wifi, 
  RefreshCw,
  Info
} from 'lucide-react';
import { HARDWARE_SPECIFICATIONS } from '../data/mockData';
import './DeviceScreen.css';

export default function DeviceScreen({ deviceStatus, onRefreshTelemetry }) {
  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || 'N/A';
  const wifiStatus = deviceStatus?.wifi_status || 'N/A';

  const formatUptime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const formatLastHeartbeat = (iso) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleTimeString() + ' (' + d.toLocaleDateString() + ')';
    } catch {
      return String(iso);
    }
  };

  return (
    <div className="device-screen-container">
      {/* Top Console Summary Header */}
      <div className="device-summary-strip glass-panel">
        <div className="dev-strip-head">
          <div className="dev-title-row">
            <span className="dev-title">AUTHENTIC EMBEDDED TELEMETRY</span>
            <StatusBadge status={isOnline ? (deviceStatus?.status || 'ONLINE') : 'OFFLINE'} />
          </div>
          <span className="dev-meta mono">
            NODE ID: {deviceStatus?.device_id || 'N/A'} • LAST HEARTBEAT: {formatLastHeartbeat(deviceStatus?.last_heartbeat)}
          </span>
        </div>

        <div className="dev-quick-actions">
          <button 
            className="dev-action-btn mono"
            onClick={onRefreshTelemetry}
            title="Refresh hardware status from backend"
          >
            <RefreshCw size={13} />
            <span>PING NODE</span>
          </button>
        </div>
      </div>

      {/* Main Hardware Subsystem Matrix (Realtime Backend Registers) */}
      <div className="subsystems-grid">
        {/* Raspberry Pi Compute Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Cpu size={16} className="sub-icon" />
              <span className="sub-title">COMPUTE TELEMETRY</span>
            </div>
            <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">SOC HARDWARE:</span>
              <span className="s-val">{deviceStatus?.hardware_model || 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU TEMPERATURE:</span>
              <span className={`s-val ${deviceStatus?.cpu_temp_c != null ? 'active' : ''}`}>
                {deviceStatus?.cpu_temp_c != null ? `${deviceStatus.cpu_temp_c}°C` : 'N/A'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU UTILIZATION:</span>
              <span className="s-val">
                {deviceStatus?.cpu_usage_percent != null ? `${deviceStatus.cpu_usage_percent}%` : 'N/A'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">RAM USAGE:</span>
              <span className="s-val">
                {deviceStatus?.ram_usage_percent != null ? `${deviceStatus.ram_usage_percent}%` : 'N/A'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">SYSTEM UPTIME:</span>
              <span className="s-val">{formatUptime(deviceStatus?.uptime_seconds)}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">IP ADDRESS:</span>
              <span className="s-val">{deviceStatus?.ip_address || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Camera Subsystem Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Camera size={16} className="sub-icon" />
              <span className="sub-title">IMAGING SENSOR</span>
            </div>
            <StatusBadge status={camStatus} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">CAMERA SENSOR:</span>
              <span className="s-val">{deviceStatus?.camera_model || 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CAMERA STATUS:</span>
              <span className={`s-val ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM RESOLUTION:</span>
              <span className="s-val">{deviceStatus?.stream_resolution || 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM FPS:</span>
              <span className="s-val">
                {isOnline && deviceStatus?.stream_fps != null ? `${deviceStatus.stream_fps} FPS` : 'N/A'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">PIPELINE:</span>
              <span className="s-val">Picamera2 / libcamera</span>
            </div>
          </div>
        </div>

        {/* Network Subsystem Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Wifi size={16} className="sub-icon" />
              <span className="sub-title">NETWORK TELEMETRY</span>
            </div>
            <StatusBadge status={wifiStatus === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">WI-FI STATUS:</span>
              <span className={`s-val ${wifiStatus === 'CONNECTED' ? 'active' : ''}`}>
                {wifiStatus}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">SSID:</span>
              <span className="s-val">{deviceStatus?.wifi_ssid || 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SIGNAL (RSSI):</span>
              <span className="s-val">
                {deviceStatus?.wifi_rssi != null ? `${deviceStatus.wifi_rssi} dBm` : 'N/A'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">HEARTBEAT FREQ:</span>
              <span className="s-val">~3.0s interval</span>
            </div>
          </div>
        </div>

        {/* Storage & Service Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <HardDrive size={16} className="sub-icon" />
              <span className="sub-title">STORAGE & AGENT</span>
            </div>
            <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">STORAGE USED:</span>
              <span className="s-val">
                {deviceStatus?.storage_used_gb != null ? `${deviceStatus.storage_used_gb} GB` : 'N/A'}
                {deviceStatus?.storage_total_gb != null ? ` / ${deviceStatus.storage_total_gb} GB` : ''}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">SERVICE DAEMON:</span>
              <span className="s-val">nocturpod-agent.service</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SOFTWARE VERSION:</span>
              <span className="s-val">{deviceStatus?.software_version || 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">AI PIPELINE:</span>
              <span className="s-val">{deviceStatus?.ai_model_version || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Static Hardware & System Specifications (Clearly Labelled) */}
      <div className="specs-section glass-panel">
        <div className="specs-header">
          <div className="specs-title-wrap">
            <Info size={15} className="specs-icon" />
            <span className="specs-title">STATIC HARDWARE SPECIFICATIONS</span>
          </div>
          <span className="specs-notice mono">SYSTEM BENCHMARK SPECIFICATIONS</span>
        </div>

        <div className="specs-grid mono">
          <div className="spec-card">
            <span className="spec-kicker">EDGE NODE HARDWARE</span>
            <span className="spec-val">{HARDWARE_SPECIFICATIONS.model}</span>
            <span className="spec-desc">{HARDWARE_SPECIFICATIONS.architecture}</span>
          </div>

          <div className="spec-card">
            <span className="spec-kicker">OPTICAL & IR SUBSYSTEM</span>
            <span className="spec-val">{HARDWARE_SPECIFICATIONS.cameraSensor}</span>
            <span className="spec-desc">{HARDWARE_SPECIFICATIONS.irCutFilter}</span>
          </div>

          <div className="spec-card">
            <span className="spec-kicker">BACKEND & STORAGE ARCHITECTURE</span>
            <span className="spec-val">Gunicorn + Supabase REST / S3</span>
            <span className="spec-desc">{HARDWARE_SPECIFICATIONS.backendHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
