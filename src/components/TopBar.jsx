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
  ChevronDown,
  Sparkles
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import './TopBar.css';

export default function TopBar({ 
  deviceStatus, 
  title, 
  subtitle, 
  onQuickCapture,
  isCapturing = false,
  isDemoMode = false,
  onToggleDemoMode
}) {
  const [currentTime, setCurrentTime] = useState('');
  const isOnline = deviceStatus?.status === 'ONLINE';

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="topbar-title">{title}</h1>
            {isDemoMode && (
              <span 
                className="mono" 
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  padding: '3px 8px',
                  background: 'rgba(250, 173, 20, 0.15)',
                  border: '1px solid #faad14',
                  borderRadius: '4px',
                  color: '#faad14'
                }}
              >
                DEMO MODE
              </span>
            )}
          </div>
          {subtitle && <span className="topbar-subtitle mono">{subtitle}</span>}
        </div>
      </div>

      <div className="topbar-right">
        {/* Device telemetry pill */}
        <div className="telemetry-bar">
          <div className="telemetry-item" title="Device Connectivity">
            {isOnline ? (
              <Wifi size={14} className="telemetry-icon active" />
            ) : (
              <WifiOff size={14} className="telemetry-icon" style={{ opacity: 0.6 }} />
            )}
            <span className="mono">{deviceStatus?.wifiSSID ?? (deviceStatus?.wifiStatus || (isOnline ? 'Connected' : 'Offline'))}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Camera Sensor">
            <Camera size={14} className={`telemetry-icon ${deviceStatus?.cameraStatus === 'ONLINE' ? 'active' : ''}`} />
            <span className="mono">
              {deviceStatus?.cameraStatus === 'ONLINE' ? 'OV5647 IR' : (deviceStatus?.cameraStatus || 'UNKNOWN')}
            </span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="PIR Motion Sensor">
            <ShieldCheck size={14} className={`telemetry-icon ${deviceStatus?.pirStatus === 'ARMED' ? 'active' : ''}`} />
            <span className="mono">
              {deviceStatus?.pirStatus === 'ARMED' ? 'PIR ARMED' : (deviceStatus?.pirStatus || 'UNKNOWN')}
            </span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="Battery Unit">
            <Battery size={14} className={`telemetry-icon ${deviceStatus?.batteryPercent != null ? 'active' : ''}`} />
            <span className="mono">{deviceStatus?.batteryPercent != null ? `${deviceStatus.batteryPercent}%` : 'N/A'}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item" title="System Clock">
            <Clock size={14} className="telemetry-icon" />
            <span className="mono">{currentTime || '00:00:00'}</span>
          </div>
        </div>

        {/* Global Node Status Badge */}
        <StatusBadge status={deviceStatus?.status ?? 'UNKNOWN'} size="normal" pulse={isOnline} />

        {/* Demo Mode Toggle */}
        {onToggleDemoMode && (
          <button
            type="button"
            className="mono"
            onClick={onToggleDemoMode}
            title={isDemoMode ? "Switch to real edge node mode" : "Explore dashboard with simulated demo data"}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '5px',
              fontSize: '11px',
              background: isDemoMode ? 'rgba(250, 173, 20, 0.2)' : 'rgba(22, 56, 50, 0.7)',
              border: `1px solid ${isDemoMode ? '#faad14' : 'var(--border-muted)'}`,
              color: isDemoMode ? '#faad14' : 'var(--color-muted-sage)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Sparkles size={13} />
            <span>{isDemoMode ? 'LIVE MODE' : 'DEMO MODE'}</span>
          </button>
        )}

        {/* Quick action: Capture */}
        {onQuickCapture && (
          <button 
            type="button"
            className="quick-trigger-btn"
            onClick={onQuickCapture}
            disabled={isCapturing}
            title={isCapturing ? "Awaiting Raspberry Pi capture upload" : "Trigger edge capture snapshot"}
            style={{ opacity: isCapturing ? 0.7 : 1, cursor: isCapturing ? 'not-allowed' : 'pointer' }}
          >
            {isCapturing ? <Sparkles size={14} className="spin-icon" /> : <Camera size={14} />}
            <span>{isCapturing ? 'CAPTURING...' : 'TRIGGER CAPTURE'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
