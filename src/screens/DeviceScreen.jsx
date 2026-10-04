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
  Layers
} from 'lucide-react';
import './DeviceScreen.css';

export default function DeviceScreen({ deviceStatus, onRefreshTelemetry }) {
  return (
    <div className="device-screen-container">
      {/* Top Console Summary Header */}
      <div className="device-summary-strip glass-panel">
        <div className="dev-strip-head">
          <div className="dev-title-row">
            <span className="dev-title">EMBEDDED EDGE HARDWARE HEALTH</span>
            <StatusBadge status={deviceStatus?.status ?? 'ONLINE'} />
          </div>
          <span className="dev-meta mono">
            NODE IDENTIFIER: {deviceStatus?.id ?? 'nocturpod-edge-01'} • ARCH: ARM64 CORTEX-A72
          </span>
        </div>

        <div className="dev-quick-actions">
          <button 
            className="dev-action-btn mono"
            onClick={onRefreshTelemetry}
            title="Poll hardware registers"
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
            <StatusBadge status="ONLINE" size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">SOC HARDWARE:</span>
              <span className="s-val">Raspberry Pi 4 Model B</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU TEMPERATURE:</span>
              <span className="s-val active">{deviceStatus?.cpuTempC ?? 44.8}°C (Nominal)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">CPU UTILIZATION:</span>
              <span className="s-val">{deviceStatus?.cpuUsagePercent ?? 28}%</span>
            </div>
            <div className="sub-row">
              <span className="s-label">RAM USAGE:</span>
              <span className="s-val">{deviceStatus?.ramUsagePercent ?? 41}% (1.64 / 4 GB)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SYSTEM UPTIME:</span>
              <span className="s-val">{deviceStatus?.uptimeHours ?? 54}h {deviceStatus?.uptimeMinutes ?? 22}m</span>
            </div>
            <div className="sub-row">
              <span className="s-label">LAST HEARTBEAT:</span>
              <span className="s-val">{deviceStatus?.lastHeartbeatSec ?? 2}s ago</span>
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
            <StatusBadge status={deviceStatus?.cameraStatus ?? 'ONLINE'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">OPTICAL SENSOR:</span>
              <span className="s-val">OmniVision OV5647 5MP</span>
            </div>
            <div className="sub-row">
              <span className="s-label">IR-CUT FILTER:</span>
              <span className="s-val active">MECHANICAL TOGGLE READY</span>
            </div>
            <div className="sub-row">
              <span className="s-label">850nm IR MATRIX:</span>
              <span className="s-val active">ACTIVE (Dual Array)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STREAM RESOLUTION:</span>
              <span className="s-val">{deviceStatus?.streamResolution ?? '1920×1080'}</span>
            </div>
            <div className="sub-row">
              <span className="s-label">TARGET FPS:</span>
              <span className="s-val">{deviceStatus?.streamFps ?? 24} FPS Constant</span>
            </div>
            <div className="sub-row">
              <span className="s-label">ENCODER:</span>
              <span className="s-val">V4L2 Hardware H.264</span>
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
            <StatusBadge status={deviceStatus?.pirStatus ?? 'ARMED'} size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">DETECTOR TYPE:</span>
              <span className="s-val">AM312 Micro Pyroelectric</span>
            </div>
            <div className="sub-row">
              <span className="s-label">TRIGGER LATENCY:</span>
              <span className="s-val active">&lt; 150 µs Edge Interrupt</span>
            </div>
            <div className="sub-row">
              <span className="s-label">DETECTION RANGE:</span>
              <span className="s-val">100° Cone • Up to 5 Meters</span>
            </div>
            <div className="sub-row">
              <span className="s-label">GPIO PIN:</span>
              <span className="s-val">BCM GPIO 17 (Pin 11)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">PULSE RE-TRIGGER:</span>
              <span className="s-val">ENABLED (Non-repeat mode)</span>
            </div>
            <div className="sub-row">
              <span className="s-label">INTERRUPT SERVICE:</span>
              <span className="s-val">Edge Daemon Active</span>
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
            <StatusBadge status="READY" size="small" />
          </div>

          <div className="sub-body mono">
            <div className="sub-row">
              <span className="s-label">BATTERY UNIT:</span>
              <span className="s-val">20,000mAh PD3.0 Rugged Pack</span>
            </div>
            <div className="sub-row">
              <span className="s-label">REMAINING CHARGE:</span>
              <span className="s-val active">{deviceStatus?.batteryPercent ?? 88}% ({deviceStatus?.batteryVoltage ?? '11.8V'})</span>
            </div>
            <div className="sub-row">
              <span className="s-label">EST. RUNTIME:</span>
              <span className="s-val">~18.4 Hours continuous</span>
            </div>
            <div className="sub-row">
              <span className="s-label">STORAGE USED:</span>
              <span className="s-val">{deviceStatus?.storageUsedGB ?? 18.4} / {deviceStatus?.storageTotalGB ?? 64.0} GB</span>
            </div>
            <div className="sub-row">
              <span className="s-label">DATABASE FILE:</span>
              <span className="s-val">storage/detections.sqlite</span>
            </div>
            <div className="sub-row">
              <span className="s-label">SSD INTEGRITY:</span>
              <span className="s-val active">SMART OK (100% Health)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
