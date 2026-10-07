import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Camera, 
  Clock, 
  Circle,
  Server
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import './TopBar.css';

export default function TopBar({ 
  deviceStatus, 
  backendOnline,
  onQuickCapture, 
  activeTab, 
  isRecording, 
  onToggleRecording 
}) {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isDeviceOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || 'N/A';
  const wifiStatus = deviceStatus?.wifi_status || 'N/A';
  const isWifiConnected = wifiStatus === 'CONNECTED';

  const getPageTitle = (tab) => {
    switch (tab) {
      case 'overview': return { title: 'Overview', sub: 'NODE TELEMETRY & LIVE OPERATIONAL METRICS' };
      case 'live': return { title: 'Live Monitor', sub: 'REAL-TIME OV5647 FEED & CAMERA CONTROLS' };
      case 'images': return { title: 'Captures', sub: 'GENUINE OV5647 STILLS & AI ENHANCEMENTS' };
      case 'footage': return { title: 'Recordings', sub: 'GENUINE FOOTAGE & AI ENHANCED CLIPS' };
      case 'events': return { title: 'Events', sub: 'CHRONOLOGICAL SENSOR AUDIT TRAIL' };
      case 'device': return { title: 'Device Telemetry', sub: 'RASPBERRY PI 4 HARDWARE REGISTERS' };
      default: return { title: 'NocturPod', sub: 'EDGE SURVEILLANCE DASHBOARD' };
    }
  };

  const { title, sub } = getPageTitle(activeTab);

  return (
    <header className="topbar-container">
      <div className="topbar-left">
        <div className="page-heading">
          <h1 className="topbar-title">{title}</h1>
          <span className="topbar-subtitle mono">{sub}</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Backend Connectivity Indicator */}
        <div className="backend-link-pill mono" title="Cloud API Backend Status">
          <Server size={13} className={backendOnline ? "server-icon online" : "server-icon offline"} />
          <span>BACKEND: {backendOnline ? 'CONNECTED' : 'UNAVAILABLE'}</span>
        </div>

        {/* Real Device Telemetry Pill */}
        <div className="telemetry-bar">
          <div className="telemetry-item" title="Device Wi-Fi Link">
            {isWifiConnected ? (
              <Wifi size={14} className="telemetry-icon active" />
            ) : (
              <WifiOff size={14} className="telemetry-icon offline" />
            )}
            <span className="mono">{wifiStatus}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="OV5647 Camera Sensor State">
            <Camera size={14} className={`telemetry-icon ${camStatus === 'ONLINE' ? 'active' : ''}`} />
            <span className="mono">CAM {camStatus}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Local Dashboard Clock">
            <Clock size={14} className="telemetry-icon" />
            <span className="mono">{currentTime || '--:--:--'}</span>
          </div>
        </div>

        {/* Device State Badge */}
        <StatusBadge 
          status={isDeviceOnline ? (deviceStatus?.status || 'ONLINE') : 'OFFLINE'} 
          size="normal" 
        />

        {/* Quick action: Capture */}
        {onQuickCapture && (
          <button 
            className="quick-trigger-btn"
            onClick={onQuickCapture}
            title={isDeviceOnline ? "Trigger edge snapshot" : "Device is offline"}
            disabled={!backendOnline}
          >
            <Camera size={14} />
            <span>CAPTURE</span>
          </button>
        )}

        {/* Quick action: Recording */}
        {onToggleRecording && (
          <button 
            className={`quick-trigger-btn record-toggle-btn ${isRecording ? 'recording' : ''}`}
            onClick={() => onToggleRecording(!isRecording)}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            disabled={!backendOnline}
          >
            <Circle size={14} fill={isRecording ? "currentColor" : "none"} />
            <span>{isRecording ? "STOP REC" : "RECORD"}</span>
          </button>
        )}
      </div>
    </header>
  );
}
