import React, { useState, useEffect, useRef } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Camera, 
  Circle, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { BACKEND_HOST } from '../services/api';
import './LivePlayer.css';

export default function LivePlayer({ 
  onSnapshot, 
  isRecording, 
  onToggleRecording, 
  cameraStatus = 'OFFLINE',
  streamResolution = '1280x720',
  streamFps = 0
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudTimestamp, setHudTimestamp] = useState('');
  const [streamActive, setStreamActive] = useState(true);
  const [streamState, setStreamState] = useState('CONNECTING'); // STREAMING, CONNECTING, OFFLINE
  const [streamKey, setStreamKey] = useState(Date.now());
  const containerRef = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setHudTimestamp(now.toTimeString().split(' ')[0] + '.' + String(Math.floor(now.getMilliseconds() / 100)));
    };
    const timer = setInterval(updateTime, 100);
    return () => clearInterval(timer);
  }, []);

  const handleFullscreenToggle = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const handleReconnect = () => {
    setStreamState('CONNECTING');
    setStreamKey(Date.now());
  };

  return (
    <div className={`live-player-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={containerRef}>
      <div className="player-inner">
        <div className="video-stream-container">
          {streamActive ? (
            <img 
              key={streamKey}
              src={`${BACKEND_HOST}/api/stream/live?t=${streamKey}`}
              alt="NocturPod Live OV5647 Stream"
              className="live-video-element"
              onLoad={() => setStreamState('STREAMING')}
              onError={() => setStreamState('OFFLINE')}
            />
          ) : null}

          {/* Fallback Display if Camera Offline or Waiting for Frames */}
          {streamState === 'OFFLINE' && (
            <div className="stream-offline-overlay">
              <div className="offline-card glass-panel">
                <AlertCircle size={36} className="offline-icon" />
                <h3 className="offline-title">CAMERA OFFLINE</h3>
                <p className="offline-sub mono">
                  Waiting for OV5647 feed from Raspberry Pi edge node...
                </p>
                <button className="stream-action-btn mono" onClick={handleReconnect}>
                  <RefreshCw size={14} />
                  <span>RECONNECT STREAM</span>
                </button>
              </div>
            </div>
          )}

          {/* Real Camera HUD Overlay */}
          <div className="stream-hud-overlay">
            <div className="hud-top-bar">
              <div className="hud-left-meta">
                <div className="live-status-pill">
                  <span className={`live-dot ${streamState === 'STREAMING' ? 'live-pulsing' : 'dot-idle'}`} />
                  <span className="live-text mono">
                    {streamState === 'STREAMING' ? 'OV5647 LIVE' : 'WAITING FOR CAMERA'}
                  </span>
                </div>
                <span className="hud-cam-model mono">OV5647 IR-CUT</span>
              </div>

              <div className="hud-right-meta mono">
                <span className="hud-clock">{hudTimestamp}</span>
                <span className="hud-res">{streamResolution}</span>
              </div>
            </div>

            {/* Recording Active Banner */}
            {isRecording && (
              <div className="rec-active-banner">
                <span className="rec-pulse-dot" />
                <span className="rec-text mono">RECORDING ORIGINAL FOOTAGE</span>
              </div>
            )}
          </div>
        </div>

        {/* Video Player Action Footer */}
        <div className="player-control-dock glass-panel">
          <div className="dock-left">
            <button 
              className="dock-action-btn capture-btn"
              onClick={onSnapshot}
              title="Capture real still frame"
            >
              <Camera size={16} />
              <span>CAPTURE</span>
            </button>

            <button 
              className={`dock-action-btn record-btn ${isRecording ? 'recording' : ''}`}
              onClick={() => onToggleRecording(!isRecording)}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              <Circle size={15} fill={isRecording ? "currentColor" : "none"} />
              <span>{isRecording ? "STOP RECORDING" : "START RECORDING"}</span>
            </button>
          </div>

          <div className="dock-center mono">
            <span className="feed-status-tag">
              STATUS: <strong className={streamState === 'STREAMING' ? 'active' : ''}>{streamState}</strong>
            </span>
          </div>

          <div className="dock-right">
            <button 
              className="dock-tool-btn"
              onClick={handleFullscreenToggle}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
