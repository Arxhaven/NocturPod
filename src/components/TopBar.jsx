import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryCharging, 
  ShieldCheck, 
  Camera, 
  Cpu, 
  Clock, 
  Bell, 
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import './TopBar.css';

export default function TopBar({ deviceStatus, title, subtitle, onQuickCapture }) {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0] + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar-container">
      <div className="topbar-left">
        <div className="page-heading">
          <h1 className="topbar-title">{title}</h1>
          {subtitle && <span className="topbar-subtitle mono">{subtitle}</span>}
        </div>
      </div>

      <div className="topbar-right">
        {/* Device telemetry pill */}
        <div className="telemetry-bar">
          <div className="telemetry-item" title="Device Connectivity">
            <Wifi size={14} className="telemetry-icon active" />
            <span className="mono">{deviceStatus?.wifiSSID ?? 'NocturNet'}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Camera Sensor">
            <Camera size={14} className="telemetry-icon active" />
            <span className="mono">OV5647 IR</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="PIR Motion Sensor">
            <ShieldCheck size={14} className="telemetry-icon active" />
            <span className="mono">PIR ARMED</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Battery Unit">
            <Battery size={14} className="telemetry-icon active" />
            <span className="mono">{deviceStatus?.batteryPercent ?? 88}%</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="System Clock">
            <Clock size={14} className="telemetry-icon" />
            <span className="mono">{currentTime || '00:00:00'}</span>
          </div>
        </div>

        {/* Global Node Status Badge */}
        <StatusBadge status={deviceStatus?.status ?? 'ONLINE'} size="normal" pulse={true} />

        {/* Quick action: Capture */}
        {onQuickCapture && (
          <button 
            className="quick-trigger-btn"
            onClick={onQuickCapture}
            title="Trigger edge capture snapshot"
          >
            <Camera size={14} />
            <span>TRIGGER CAPTURE</span>
          </button>
        )}
      </div>
    </header>
  );
}
