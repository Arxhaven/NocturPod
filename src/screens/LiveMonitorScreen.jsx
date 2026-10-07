import React from 'react';
import LivePlayer from '../components/LivePlayer';
import StatusBadge from '../components/StatusBadge';
import { Camera, Circle, Cpu, Radio, Shield } from 'lucide-react';
import './LiveMonitorScreen.css';

export default function LiveMonitorScreen({ 
  deviceStatus, 
  onSnapshot, 
  isRecording, 
  onToggleRecording 
}) {
  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || deviceStatus?.cameraStatus || (isOnline ? 'ONLINE' : 'OFFLINE');
  const resolution = deviceStatus?.stream_resolution || deviceStatus?.streamResolution || '1280x720';
  const fps = deviceStatus?.stream_fps || deviceStatus?.streamFps || (isOnline ? 15 : 0);

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
              streamResolution={resolution}
              streamFps={fps}
            />
          </div>
        </div>

        {/* Live Feed Sidebar: Real device information */}
        <div className="monitor-side-col">
          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">LIVE CAMERA NODE</span>
                <span className="panel-sub mono">{deviceStatus?.device_id || deviceStatus?.id || 'nocturpod-edge-01'}</span>
              </div>
              <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="small" />
            </div>

            <div className="telemetry-box mono">
              <div className="t-row">
                <span>CAMERA STATUS:</span>
                <span className={`t-val ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
              </div>
              <div className="t-row">
                <span>HARDWARE:</span>
                <span className="t-val">{deviceStatus?.hardware_model || deviceStatus?.hardware || 'Raspberry Pi 4 8GB'}</span>
              </div>
              <div className="t-row">
                <span>SENSOR:</span>
                <span className="t-val">{deviceStatus?.camera_model || deviceStatus?.cameraModel || 'OV5647 IR-Cut'}</span>
              </div>
              <div className="t-row">
                <span>STREAM RES:</span>
                <span className="t-val">{resolution}</span>
              </div>
              <div className="t-row">
                <span>STREAM FPS:</span>
                <span className="t-val">{fps} FPS</span>
              </div>
              <div className="t-row">
                <span>RECORDING:</span>
                <span className={`t-val ${isRecording ? 'active' : ''}`}>
                  {isRecording ? 'ACTIVE' : 'IDLE'}
                </span>
              </div>
            </div>
          </div>

          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <span className="panel-title">ACTIONS</span>
            </div>
            <div className="panel-quick-actions">
              <button 
                className="btn-full-action capture-btn mono"
                onClick={onSnapshot}
              >
                <Camera size={16} />
                <span>MANUAL CAPTURE</span>
              </button>
              <button 
                className={`btn-full-action record-btn mono ${isRecording ? 'active' : ''}`}
                onClick={() => onToggleRecording(!isRecording)}
              >
                <Circle size={16} fill={isRecording ? "currentColor" : "none"} />
                <span>{isRecording ? "STOP RECORDING" : "START RECORDING"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
