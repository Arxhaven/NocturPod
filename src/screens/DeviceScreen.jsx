import React from 'react';
import StatusBadge from '../components/StatusBadge';
import { 
  HardDrive, 
  Cpu, 
  Camera, 
  ShieldCheck, 
  Battery, 
  Wifi, 
  Thermometer, 
  Activity, 
  Clock, 
  Zap, 
  RefreshCw,
  Server,
  Layers,
  AlertTriangle
} from 'lucide-react';
import { formatHeartbeat } from '../utils/deviceStatus';
import './DeviceScreen.css';

export default function DeviceScreen({ 
  deviceStatus, 
  onRefreshTelemetry, 
  isRefreshing = false, 
  telemetryError = null 
}) {
  const isOnline = deviceStatus?.status === 'ONLINE';

  return (
    <div className="device-screen-container">
      {/* Top Console Summary Header */}
      <div className="device-summary-strip glass-panel">
        <div className="dev-strip-head">
          <div className="dev-title-row">
            <span className="dev-title">EMBEDDED EDGE HARDWARE HEALTH</span>
            <StatusBadge status={deviceStatus?.status ?? 'UNKNOWN'} />
          </div>
          <span className="dev-meta mono">
            NODE IDENTIFIER: {deviceStatus?.id ?? 'nocturpod-edge-01'} • {isOnline ? (deviceStatus?.hardware || 'ARM64 LINUX HOST') : 'NODE UNREACHABLE'}
          </span>
        </div>

        <div className="dev-quick-actions">
          <button 
            className="dev-action-btn mono"
            onClick={onRefreshTelemetry}
            disabled={isRefreshing}
            title="Poll hardware registers"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
            <span>{isRefreshing ? 'QUERYING...' : 'PING NODE'}</span>
          </button>
        </div>
      </div>

      {telemetryError && (
        <div 
          className="telemetry-error-bar mono"
          style={{
            background: 'rgba(255, 77, 79, 0.12)',
            border: '1px solid rgba(255, 77, 79, 0.3)',
            color: '#ff7875',
            padding: '12px 16px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} />
            <span>TELEMETRY SYNC FAILED: {telemetryError}</span>
          </div>
          <button
            type="button"
            onClick={onRefreshTelemetry}
            className="mono"
            style={{
              background: 'rgba(255, 77, 79, 0.25)',
              border: '1px solid #ff7875',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* Main Hardware Subsystem Matrix */}
      <div className="subsystems-grid">
        {/* Raspberry Pi Compute Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Cpu size={16} className="sub-icon" />
              <span className="sub-title">COMPUTE SYSTEM</span>
            </div>
            <StatusBadge status={isOnline ? "ONLINE" : (deviceStatus?.status ?? "UNKNOWN")} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">SOC HARDWARE:</span>
              <span className="s-val">{deviceStatus?.hardware || (isOnline ? 'Development Host' : 'Unavailable')}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU TEMPERATURE:</span>
              <span className={`s-val ${deviceStatus?.cpuTempC != null ? 'active' : ''}`}>
                {deviceStatus?.cpuTempC != null ? `${deviceStatus.cpuTempC}°C` : 'Unavailable'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU UTILIZATION:</span>
              <span className="s-val">
                {deviceStatus?.cpuUsagePercent != null ? `${deviceStatus.cpuUsagePercent}%` : 'Unavailable'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">RAM USAGE:</span>
              <span className="s-val">
                {deviceStatus?.ramUsagePercent != null ? `${deviceStatus.ramUsagePercent}%` : 'Unavailable'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">SYSTEM UPTIME:</span>
              <span className="s-val">
                {deviceStatus?.uptimeHours != null && deviceStatus?.uptimeMinutes != null 
                  ? `${deviceStatus.uptimeHours}h ${deviceStatus.uptimeMinutes}m` 
                  : 'Unavailable'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">LAST HEARTBEAT:</span>
              <span className="s-val">
                {formatHeartbeat(deviceStatus?.status, deviceStatus?.lastHeartbeatSec)}
              </span>
            </div>
          </div>
        </div>

        {/* Camera Subsystem Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Camera size={16} className="sub-icon" />
              <span className="sub-title">IMAGING SENSOR & IR</span>
            </div>
            <StatusBadge status={deviceStatus?.cameraStatus ?? 'UNKNOWN'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">OPTICAL SENSOR:</span>
              <span className="s-val">{deviceStatus?.cameraModel || (isOnline ? 'OV5647 (Unverified)' : 'Unavailable')}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">IR-CUT FILTER:</span>
              <span className={`s-val ${deviceStatus?.cameraStatus === 'ONLINE' ? 'active' : ''}`}>
                {deviceStatus?.cameraStatus === 'ONLINE' ? 'MECHANICAL TOGGLE READY' : 'UNVERIFIED'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">850nm IR MATRIX:</span>
              <span className={`s-val ${deviceStatus?.irNightMode && deviceStatus.irNightMode !== 'OFF' ? 'active' : ''}`}>
                {deviceStatus?.irNightMode || 'UNKNOWN'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM RESOLUTION:</span>
              <span className="s-val">{deviceStatus?.streamResolution ?? '1920×1080'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">TARGET FPS:</span>
              <span className="s-val">{deviceStatus?.streamFps != null ? `${deviceStatus.streamFps} FPS Constant` : 'N/A'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">ENCODER:</span>
              <span className="s-val">{isOnline ? 'V4L2 Hardware / MJPEG' : 'Unavailable'}</span>
            </div>
          </div>
        </div>

        {/* PIR Motion Sensor Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <ShieldCheck size={16} className="sub-icon" />
              <span className="sub-title">PIR MOTION SENSOR</span>
            </div>
            <StatusBadge status={deviceStatus?.pirStatus ?? 'UNKNOWN'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">DETECTOR TYPE:</span>
              <span className="s-val">{deviceStatus?.pirSensor || (isOnline ? 'HC-SR501 / AM312' : 'Unavailable')}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SENSOR STATUS:</span>
              <span className={`s-val ${deviceStatus?.pirStatus === 'ARMED' ? 'active' : ''}`}>
                {deviceStatus?.pirStatus ?? 'UNKNOWN'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">DETECTION CONE:</span>
              <span className="s-val">100° Aperture • Up to 5m</span>
            </div>
            <div className="sub-row">
              <span className="s-label">GPIO INTERRUPT:</span>
              <span className="s-val">{isOnline ? 'BCM GPIO 17 (Pin 11)' : 'Unavailable'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">INTERRUPT SERVICE:</span>
              <span className="s-val">{isOnline ? 'Edge Daemon Active' : 'Disconnected'}</span>
            </div>
          </div>
        </div>

        {/* Power Bank & Storage Card */}
        <div className="subsystem-card glass-panel">
          <div className="sub-header">
            <div className="sub-title-wrap">
              <Battery size={16} className="sub-icon" />
              <span className="sub-title">POWER & PERSISTENCE</span>
            </div>
            <StatusBadge status={isOnline ? "READY" : "OFFLINE"} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">POWER SOURCE:</span>
              <span className="s-val">{deviceStatus?.powerSource || (isOnline ? 'EXTERNAL_DC' : 'Unavailable')}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">BATTERY FUEL GAUGE:</span>
              <span className="s-val">
                {deviceStatus?.batteryPercent != null 
                  ? `${deviceStatus.batteryPercent}% (${deviceStatus?.batteryVoltage || 'Nominal'})` 
                  : 'N/A (No Hardware Fuel Gauge)'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">STORAGE USED:</span>
              <span className="s-val">
                {deviceStatus?.storageUsedGB != null 
                  ? `${deviceStatus.storageUsedGB} / ${deviceStatus.storageTotalGB || 64.0} GB` 
                  : 'Unavailable'}
              </span>
            </div>
            <div className="sub-row">
              <span className="s-label">DATABASE FILE:</span>
              <span className="s-val">{isOnline ? 'storage/detections.sqlite' : 'Unavailable'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STORAGE INTEGRITY:</span>
              <span className={`s-val ${isOnline && deviceStatus?.storageUsedGB != null ? 'active' : ''}`}>
                {isOnline && deviceStatus?.storageUsedGB != null ? 'ACCESSIBLE' : 'UNVERIFIED'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
