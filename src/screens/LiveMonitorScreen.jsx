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
  isRecording, 
  onToggleRecording,
  claheActive,
  onToggleClahe,
  events
}) {
  const [streamBitrate, setStreamBitrate] = useState('4.8 Mbps');
  const [exposureMode, setExposureMode] = useState('NIGHT_IR_SYNC');
  const [hudGridOverlay, setHudGridOverlay] = useState(true);

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
              claheActive={claheActive}
              onToggleClahe={onToggleClahe}
              irNightMode={deviceStatus?.irNightMode ?? 'AUTO_ACTIVE'}
              streamResolution={deviceStatus?.streamResolution ?? '1920×1080'}
              cameraStatus={deviceStatus?.cameraStatus ?? 'ONLINE'}
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
              <span className="ctrl-val mono">H.264 / RTSP OVER WS</span>
              <span className="ctrl-divider">|</span>
              <span className="ctrl-val mono">JITTER: 1.2ms</span>
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
              <StatusBadge status="ARMED" size="small" />
            </div>

            <div className="telemetry-box mono">
              <div className="t-row">
                <span>INFERENCE LATENCY:</span>
                <span className="t-val">38.4 ms</span>
              </div>
              <div className="t-row">
                <span>CLAHE CLIP LIMIT:</span>
                <span className="t-val">2.28 (Adaptive)</span>
              </div>
              <div className="t-row">
                <span>LOCAL SPOOL BUFFER:</span>
                <span className="t-val active">ACTIVE (Nominal)</span>
              </div>
              <div className="t-row">
                <span>NCNN BACKEND:</span>
                <span className="t-val">Vulkan / ARM FP16</span>
              </div>
            </div>

            <div className="target-stream-list">
              <span className="target-stream-header mono">DETECTED OBJECTS IN FRAME</span>
              <div className="target-item">
                <div className="target-badge-col">
                  <span className="t-badge mono">PERSON</span>
                  <span className="t-conf mono">94.2%</span>
                </div>
                <div className="target-meta">
                  <span className="target-coords mono">BBOX: [140, 80, 420, 580]</span>
                  <span className="target-status mono">STATUS: CONFIRMED TARGET</span>
                </div>
              </div>

              <div className="target-item secondary">
                <div className="target-badge-col">
                  <span className="t-badge mono">BICYCLE</span>
                  <span className="t-conf mono">86.1%</span>
                </div>
                <div className="target-meta">
                  <span className="target-coords mono">BBOX: [380, 240, 520, 510]</span>
                  <span className="target-status mono">STATUS: CONFIRMED TARGET</span>
                </div>
              </div>
            </div>
          </div>

          {/* Trigger Event Log (Bottom panel) */}
          <div className="monitor-panel glass-panel">
            <div className="panel-head">
              <span className="panel-title">EDGE EVENT DISPATCH</span>
              <span className="panel-sub mono">LIVE BUFFER</span>
            </div>

            <div className="buffer-log-list mono">
              <div className="buffer-entry">
                <span className="b-time">12:31:08.412</span>
                <span className="b-event">PERSON CONFIRMED (0.94)</span>
              </div>
              <div className="buffer-entry">
                <span className="b-time">12:31:07.120</span>
                <span className="b-event">AI INFERENCE COMPLETE</span>
              </div>
              <div className="buffer-entry">
                <span className="b-time">12:31:05.804</span>
                <span className="b-event">CLAHE LUM ENHANCE (2.28)</span>
              </div>
              <div className="buffer-entry">
                <span className="b-time">12:31:05.102</span>
                <span className="b-event">OV5647 FRAME CAPTURED</span>
              </div>
              <div className="buffer-entry active">
                <span className="b-time">12:31:04.990</span>
                <span className="b-event highlight">EDGE VISION MOTION TRIGGER</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
