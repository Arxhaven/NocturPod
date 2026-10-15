import React from 'react';
import LivePlayer from '../components/LivePlayer';
import StatusBadge from '../components/StatusBadge';
import { Camera, Circle, Sun, Moon } from 'lucide-react';
import './LiveMonitorScreen.css';

export default function LiveMonitorScreen({ 
  deviceStatus, 
  onSnapshot, 
  isRecording, 
  onToggleRecording,
  onToggleLightMode,
  isSwitchingLight = false
}) {
  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || 'N/A';
  const resolution = deviceStatus?.stream_resolution || 'N/A';
  const fps = isOnline && deviceStatus?.stream_fps != null ? `${deviceStatus.stream_fps} FPS` : 'N/A';
  const currentLightMode = deviceStatus?.light_mode || deviceStatus?.lightMode || 'WHITE';

  return (
    <div className="live-monitor-container">
      <div className="live-monitor-grid">
        {/* Main large video area */}
        <div className="monitor-main-col">
          <div className="monitor-player-card glass-panel">
            <LivePlayer 
              onSnapshot={onSnapshot}
              isRecording={isRecording}
              onToggleRecording={onToggleRecording}
              cameraStatus={camStatus}
              streamResolution={deviceStatus?.stream_resolution}
              streamFps={deviceStatus?.stream_fps}
            />
          </div>
        </div>

        {/* Live Feed Sidebar: Real device information */}
        <div className="monitor-side-col">
          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">LIVE CAMERA NODE</span>
                <span className="panel-sub mono">{deviceStatus?.device_id || 'nocturpod-edge-01'}</span>
              </div>
              <StatusBadge status={isOnline ? (deviceStatus?.status || 'ONLINE') : 'OFFLINE'} size="small" />
            </div>

            <div className="telemetry-box mono">
              <div className="t-row">
                <span>CAMERA SENSOR:</span>
                <span className={`t-val ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
              </div>
              <div className="t-row">
                <span>HARDWARE MODEL:</span>
                <span className="t-val">{deviceStatus?.hardware_model || 'N/A'}</span>
              </div>
              <div className="t-row">
                <span>CAMERA MODEL:</span>
                <span className="t-val">{deviceStatus?.camera_model || 'N/A'}</span>
              </div>
              <div className="t-row">
                <span>STREAM RES:</span>
                <span className="t-val">{resolution}</span>
              </div>
              <div className="t-row">
                <span>STREAM FPS:</span>
                <span className="t-val">{fps}</span>
              </div>
              <div className="t-row">
                <span>RECORDING:</span>
                <span className={`t-val ${isRecording ? 'recording' : ''}`}>
                  {isRecording ? 'RECORDING' : 'IDLE'}
                </span>
              </div>
              <div className="t-row">
                <span>LIGHTING MODE:</span>
                <span className={`t-val ${currentLightMode === 'NIGHT' ? 'night-active' : 'active'}`}>
                  {currentLightMode === 'NIGHT' ? 'MODE B: NIGHT' : 'MODE A: WHITE'}
                </span>
              </div>
            </div>
          </div>

          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <span className="panel-title">EDGE COMMANDS</span>
            </div>

            {/* Dual Light Mode Selector */}
            <div className="light-mode-control-block">
              <div className="light-mode-header mono">
                <span className="light-mode-label">ILLUMINATION MODE</span>
                <span className="light-mode-chip">
                  {currentLightMode === 'NIGHT' ? 'BCM 23 [IR/NIGHT]' : 'BCM 18 [WHITE]'}
                </span>
              </div>
              <div className="light-mode-btn-group">
                <button
                  type="button"
                  className={`light-mode-switch-btn mono ${currentLightMode === 'WHITE' ? 'active-white' : ''}`}
                  onClick={() => onToggleLightMode && onToggleLightMode('WHITE')}
                  disabled={isSwitchingLight || !isOnline}
                  title="Activate Mode A: White / Normal Light (BCM 18)"
                >
                  <Sun size={14} />
                  <span>MODE A: WHITE</span>
                </button>
                <button
                  type="button"
                  className={`light-mode-switch-btn mono ${currentLightMode === 'NIGHT' ? 'active-night' : ''}`}
                  onClick={() => onToggleLightMode && onToggleLightMode('NIGHT')}
                  disabled={isSwitchingLight || !isOnline}
                  title="Activate Mode B: Night / Low-Light Mode (BCM 23)"
                >
                  <Moon size={14} />
                  <span>MODE B: NIGHT</span>
                </button>
              </div>
            </div>

            <div className="panel-quick-actions">
              <button 
                type="button"
                className="btn-full-action capture-btn mono"
                onClick={onSnapshot}
              >
                <Camera size={15} />
                <span>MANUAL CAPTURE</span>
              </button>
              <button 
                type="button"
                className={`btn-full-action record-btn mono ${isRecording ? 'active' : ''}`}
                onClick={() => onToggleRecording(!isRecording)}
              >
                <Circle size={15} fill={isRecording ? "currentColor" : "none"} />
                <span>{isRecording ? "STOP RECORDING" : "START RECORDING"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
