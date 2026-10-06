import React from 'react';
import StatusBadge from '../components/StatusBadge';
import { 
  HardDrive, 
  Cpu, 
  Camera, 
  Wifi, 
  Thermometer, 
  Clock, 
  RefreshCw,
  Server,
  Layers
} from 'lucide-react';
import './DeviceScreen.css';

export default function DeviceScreen({ deviceStatus, onRefreshTelemetry }) {
  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || deviceStatus?.cameraStatus || (isOnline ? 'ONLINE' : 'OFFLINE');

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="device-screen-container">
      {/* Top Console Summary Header */}
      <div className="device-summary-strip glass-panel">
        <div className="dev-strip-head">
          <div className="dev-title-row">
            <span className="dev-title">EMBEDDED HARDWARE TELEMETRY</span>
            <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} />
          </div>
          <span className="dev-meta mono">
            NODE IDENTIFIER: {deviceStatus?.device_id || deviceStatus?.id || 'nocturpod-edge-01'} • MODEL: {deviceStatus?.hardware_model || deviceStatus?.hardware || 'Raspberry Pi 4 Model B 8GB'}
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

      {/* Main Hardware Subsystem Matrix */}
      <div className="subsystems-grid">
        {/* Raspberry Pi Compute Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Cpu size={16} className="sub-icon" />
              <span className="sub-title">COMPUTE SYSTEM</span>
            </div>
            <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">SOC HARDWARE:</span>
              <span className="s-val">{deviceStatus?.hardware_model || deviceStatus?.hardware || 'Raspberry Pi 4 Model B 8GB'}</span>
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
              <span className="s-val">{deviceStatus?.camera_model || deviceStatus?.cameraModel || 'OV5647 IR-Cut'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">IR ILLUMINATION:</span>
              <span className="s-val active">850nm IR Illumination</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM RESOLUTION:</span>
              <span className="s-val">{deviceStatus?.stream_resolution || deviceStatus?.streamResolution || '1280x720'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM FPS:</span>
              <span className="s-val">{deviceStatus?.stream_fps || deviceStatus?.streamFps || (isOnline ? 15 : 0)} FPS</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CAMERA STATUS:</span>
              <span className={`s-val ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
            </div>
          </div>
        </div>

        {/* Network Subsystem Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Wifi size={16} className="sub-icon" />
              <span className="sub-title">NETWORK CONNECTIVITY</span>
            </div>
            <StatusBadge status={deviceStatus?.wifi_status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">WI-FI STATUS:</span>
              <span className={`s-val ${deviceStatus?.wifi_status === 'CONNECTED' ? 'active' : ''}`}>
                {deviceStatus?.wifi_status || 'DISCONNECTED'}
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
              <span className="s-label">BACKEND LINK:</span>
              <span className="s-val active">HTTPS / PostgREST</span>
            </div>
          </div>
        </div>

        {/* Storage & Service Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <HardDrive size={16} className="sub-icon" />
              <span className="sub-title">PERSISTENCE & AGENT</span>
            </div>
            <StatusBadge status="READY" size="small" />
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
              <span className="s-label">LOCAL MEDIA SPOOL:</span>
              <span className="s-val active">~/nocturpod/media/</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SERVICE DAEMON:</span>
              <span className="s-val">nocturpod-agent.service (systemd)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SOFTWARE VERSION:</span>
              <span className="s-val">{deviceStatus?.software_version || '1.0.0'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">AI PIPELINE:</span>
              <span className="s-val">{deviceStatus?.ai_model_version || 'Adaptive CLAHE + YOLOv8n'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
