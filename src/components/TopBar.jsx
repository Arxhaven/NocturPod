import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Camera, 
  Clock, 
  Circle
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import './TopBar.css';

export default function TopBar({ 
  deviceStatus, 
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

  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || deviceStatus?.cameraStatus || (isOnline ? 'ONLINE' : 'OFFLINE');

  const getPageTitle = (tab) => {
    switch (tab) {
      case 'overview': return { title: 'Overview', sub: 'NOCTURPOD // NODE STATUS & METRICS' };
      case 'live': return { title: 'Live Monitor', sub: 'REAL-TIME OV5647 FEED & CAMERA CONTROLS' };
      case 'images': return { title: 'Captures', sub: 'ORIGINAL & AI ENHANCED STILLS' };
      case 'footage': return { title: 'Recordings', sub: 'ORIGINAL & AI ENHANCED VIDEO CLIPS' };
      case 'events': return { title: 'Events', sub: 'CHRONOLOGICAL SENSOR AUDIT TRAIL' };
      case 'device': return { title: 'Device Telemetry', sub: 'RASPBERRY PI 4 HARDWARE REGISTERS' };
      default: return { title: 'NocturPod', sub: 'EDGE SURVEILLANCE SYSTEM' };
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
        {/* Device telemetry pill */}
        <div className="telemetry-bar">
          <div className="telemetry-item" title="Device Connectivity">
            {isOnline ? (
              <Wifi size={14} className="telemetry-icon active" />
            ) : (
              <WifiOff size={14} className="telemetry-icon offline" />
            )}
            <span className="mono">{deviceStatus?.wifi_status || (isOnline ? 'CONNECTED' : 'DISCONNECTED')}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Camera Sensor">
            <Camera size={14} className={`telemetry-icon ${camStatus === 'ONLINE' ? 'active' : ''}`} />
            <span className="mono">OV5647 {camStatus}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="System Clock">
            <Clock size={14} className="telemetry-icon" />
            <span className="mono">{currentTime || '00:00:00'}</span>
          </div>
        </div>

        {/* Global Node Status Badge */}
        <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="normal" pulse={isOnline} />

        {/* Quick action: Capture */}
        {onQuickCapture && (
          <button 
            className="quick-trigger-btn"
            onClick={onQuickCapture}
            title="Trigger edge capture"
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
          >
            <Circle size={14} fill={isRecording ? "currentColor" : "none"} />
            <span>{isRecording ? "STOP REC" : "RECORD"}</span>
          </button>
        )}
      </div>
    </header>
  );
}
