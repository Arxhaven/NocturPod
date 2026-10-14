import React, { useState } from 'react';
import LivePlayer from '../components/LivePlayer';
import StatusBadge from '../components/StatusBadge';
import { 
  ShieldAlert, 
  Activity, 
  Sliders, 
  Layers, 
  Sparkles, 
  Zap, 
  Crosshair, 
  Download,
  AlertTriangle,
  Compass,
  Gauge
} from 'lucide-react';
import './LiveMonitorScreen.css';

export default function LiveMonitorScreen({ 
  deviceStatus, 
  onSnapshot, 
  isCapturing = false,
  isRecording, 
  onToggleRecording,
  claheActive,
  onToggleClahe,
  events = [],
  onShowToast
}) {
  const [exposureMode, setExposureMode] = useState('NIGHT_IR_SYNC');
  const isOnline = deviceStatus?.status === 'ONLINE';

  // Get active detected targets from latest event or empty
  const latestEventWithDetections = events.find(e => e.detections && e.detections.length > 0);
  const activeTargets = latestEventWithDetections?.detections || [];

  return (
    <div className="live-monitor-container">
      <div className="live-monitor-grid">
        {/* Main large video area */}
        <div className="monitor-main-col">
          <div className="monitor-player-card glass-panel">
            <LivePlayer 
              onSnapshot={onSnapshot}
              isCapturing={isCapturing}
              isRecording={isRecording}
              onToggleRecording={onToggleRecording}
              claheActive={claheActive}
              onToggleClahe={onToggleClahe}
              irNightMode={deviceStatus?.irNightMode ?? 'AUTO_ACTIVE'}
              deviceStatus={deviceStatus}
              onShowToast={onShowToast}
            />
          </div>

          {/* Quick HUD Camera Controls Bar */}
          <div className="camera-controls-strip glass-panel">
            <div className="ctrl-group">
              <span className="ctrl-label mono">EXPOSURE MODE:</span>
              <button 
                className={`ctrl-chip mono ${exposureMode === 'NIGHT_IR_SYNC' ? 'active' : ''}`}
                onClick={() => setExposureMode('NIGHT_IR_SYNC')}
              >
                IR SYNC 850nm
              </button>
              <button 
                className={`ctrl-chip mono ${exposureMode === 'DAY_PASS' ? 'active' : ''}`}
                onClick={() => setExposureMode('DAY_PASS')}
              >
                DAY PASS
              </button>
              <button 
                className={`ctrl-chip mono ${exposureMode === 'LOW_LIGHT_BOOST' ? 'active' : ''}`}
                onClick={() => setExposureMode('LOW_LIGHT_BOOST')}
              >
                GAIN BOOST
              </button>
            </div>

            <div className="ctrl-group">
              <span className="ctrl-label mono">STREAM:</span>
              <span className="ctrl-val mono">{isOnline ? 'MJPEG OVER HTTP (/stream)' : 'OFFLINE / STANDBY'}</span>
              <span className="ctrl-divider">|</span>
              <span className="ctrl-val mono">{isOnline ? 'TRANSPORT: OK' : 'NO CARRIER'}</span>
            </div>
          </div>
        </div>

        {/* Live Feed Sidebar: Real-time trigger stream & AI confidence stream */}
        <div className="monitor-side-col">
          {/* Live Edge Detection Status */}
          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">REAL-TIME INFERENCE STREAM</span>
                <span className="panel-sub mono">YOLOV8N • ADAPTIVE CLAHE</span>
              </div>
              <StatusBadge status={isOnline ? (deviceStatus?.pirStatus ?? "READY") : "OFFLINE"} size="small" />
            </div>

            <div className="telemetry-box mono">
              <div className="t-row">
                <span>INFERENCE ENGINE:</span>
                <span className="t-val">{isOnline ? 'YOLOv8n / NCNN' : 'Standby (Offline)'}</span>
              </div>
              <div className="t-row">
                <span>CLAHE NORMALIZATION:</span>
                <span className="t-val">{claheActive ? 'Active (2.2)' : 'Bypassed'}</span>
              </div>
              <div className="t-row">
                <span>PIR SENSOR:</span>
                <span className={`t-val ${deviceStatus?.pirStatus === 'ARMED' ? 'active' : ''}`}>
                  {deviceStatus?.pirStatus ?? 'UNKNOWN'}
                </span>
              </div>
              <div className="t-row">
                <span>BACKEND STATUS:</span>
                <span className="t-val">{isOnline ? 'CONNECTED' : 'DISCONNECTED'}</span>
              </div>
            </div>

            <div className="target-stream-list">
              <span className="target-stream-header mono">DETECTED OBJECTS IN FRAME</span>
              {activeTargets.length > 0 ? (
                activeTargets.map((tgt, i) => (
                  <div key={i} className="target-item">
                    <div className="target-badge-col">
                      <span className="t-badge mono">{tgt.label.toUpperCase()}</span>
                      <span className="t-conf mono">
                        {tgt.confidence != null ? `${(tgt.confidence <= 1 ? tgt.confidence * 100 : tgt.confidence).toFixed(1)}%` : ''}
                      </span>
                    </div>
                    <div className="target-meta">
                      <span className="target-coords mono">BBOX: [{Array.isArray(tgt.box) ? tgt.box.join(', ') : 'N/A'}]</span>
                      <span className="target-status mono">STATUS: CONFIRMED TARGET</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="target-item-empty mono" style={{ padding: '16px 10px', color: 'var(--color-muted-sage)', fontSize: '11px', textAlign: 'center' }}>
                  No active optical targets in current frame.
                </div>
              )}
            </div>
          </div>

          {/* Trigger Event Log (Bottom panel) */}
          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <span className="panel-title">EDGE EVENT DISPATCH</span>
              <span className="panel-sub mono">LIVE BUFFER</span>
            </div>

            <div className="buffer-log-list mono">
              {events.length > 0 ? (
                events.slice(0, 5).map((evt, idx) => (
                  <div key={evt.id || idx} className={`buffer-entry ${idx === 0 ? 'active' : ''}`}>
                    <span className="b-time">{evt.timestamp?.split(' ')[1] || evt.timestamp}</span>
                    <span className={`b-event ${idx === 0 ? 'highlight' : ''}`}>{evt.label?.toUpperCase()}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '14px 10px', color: 'var(--color-muted-sage)', fontSize: '11px', textAlign: 'center' }}>
                  No trigger events in buffer.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
