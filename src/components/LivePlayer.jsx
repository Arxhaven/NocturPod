import React, { useState, useEffect, useRef } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Camera, 
  Circle, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Eye, 
  Sparkles,
  Zap,
  Info,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { BACKEND_HOST } from '../services/api';
import './LivePlayer.css';

export default function LivePlayer({ 
  onSnapshot, 
  isRecording, 
  onToggleRecording, 
  claheActive = true, 
  onToggleClahe,
  irNightMode = 'AUTO_ACTIVE',
  streamResolution = '1920×1080',
  cameraStatus = 'ONLINE'
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [fps, setFps] = useState(24);
  const [hudTimestamp, setHudTimestamp] = useState('');
  const [streamActive, setStreamActive] = useState(true);
  const [streamState, setStreamState] = useState('STREAMING'); // STREAMING, CONNECTING, OFFLINE, PAUSED
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

  const [streamMode, setStreamMode] = useState('live'); // 'live' or 'demo'

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
    setStreamMode('live');
    setStreamState('CONNECTING');
    setStreamKey(Date.now());
    setTimeout(() => {
      setStreamState('STREAMING');
    }, 600);
  };

  const toggleStreamPlay = () => {
    if (streamActive) {
      setStreamActive(false);
      setStreamState('PAUSED');
    } else {
      setStreamActive(true);
      setStreamState('STREAMING');
      setStreamKey(Date.now());
    }
  };

  return (
    <div className={`live-player-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={containerRef}>
      <div className="player-inner">
        <div className="video-stream-container">
          {/* Active Live Stream Source or Demo Video */}
          {streamActive ? (
            streamMode === 'live' ? (
              <img 
                key={streamKey}
                src={`${BACKEND_HOST}/api/stream/live?t=${streamKey}`}
                alt="NocturPod Live Camera Feed"
                className={`live-video-element ${claheActive ? 'clahe-filter-enhanced' : ''}`}
                onLoad={() => setStreamState('STREAMING')}
                onError={() => setStreamState('OFFLINE')}
              />
            ) : (
              <video 
                className={`live-video-element ${claheActive ? 'clahe-filter-enhanced' : ''}`}
                autoPlay 
                loop 
                muted={isMuted} 
                playsInline
                poster="https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1200&q=80"
              >
                <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" type="video/mp4" />
              </video>
            )
          ) : (
            <div className="stream-paused-placeholder">
              <span className="mono">STREAM PAUSED BY OPERATOR</span>
              <button className="reconnect-btn mono" onClick={toggleStreamPlay}>
                <Play size={14} /> RESUME FEED
              </button>
            </div>
          )}

          {/* Connection Failure State Overlay */}
          {streamState === 'OFFLINE' && streamMode === 'live' && (
            <div className="stream-error-overlay">
              <AlertTriangle size={28} color="#ff4d4f" />
              <span className="err-title mono">FEED CONNECTION INTERRUPTED</span>
              <span className="err-sub mono">Edge Raspberry Pi or streaming server unreachable</span>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button className="reconnect-btn mono" onClick={handleReconnect}>
                  <RefreshCw size={13} /> RETRY EDGE LINK
                </button>
                <button 
                  className="reconnect-btn mono" 
                  style={{ background: 'rgba(35, 83, 71, 0.85)', borderColor: 'var(--color-light-green)' }}
                  onClick={() => { setStreamMode('demo'); setStreamState('STREAMING'); }}
                >
                  <Eye size={13} /> VIEW DEMO FEED
                </button>
              </div>
            </div>
          )}

          {/* Low light night vision noise / grain overlay */}
          <div className="night-vision-grain" />

          {/* Aerospace HUD Overlays */}
          <div className="hud-overlay-container">
            {/* Top HUD Row */}
            <div className="hud-top-bar">
              <div className="hud-group">
                <div className={`live-pill ${streamState !== 'STREAMING' ? 'offline' : ''}`}>
                  <span className="live-dot" />
                  <span className="mono">{streamState}</span>
                </div>
                <span className="hud-data mono">{streamResolution}</span>
                <span className="hud-data mono">{streamState === 'STREAMING' ? `${fps} FPS` : '0 FPS'}</span>
                <span className="hud-data hud-accent mono">OV5647-IR</span>
              </div>

              <div className="hud-group">
                <span className="hud-data mono">{hudTimestamp}</span>
                <span className={`hud-badge mono ${claheActive ? 'active' : ''}`}>
                  CLAHE: {claheActive ? 'ADAPTIVE 2.2' : 'BYPASS'}
                </span>
                <span className="hud-badge mono ir-mode">
                  IR: {irNightMode}
                </span>
              </div>
            </div>

            {/* Aerospace Center Crosshairs & Corner Brackets */}
            <div className="hud-reticle">
              <div className="reticle-corner top-left" />
              <div className="reticle-corner top-right" />
              <div className="reticle-corner bottom-left" />
              <div className="reticle-corner bottom-right" />
              
              <div className="center-crosshair">
                <div className="ch-line-h" />
                <div className="ch-line-v" />
                <div className="ch-box" />
              </div>

              {/* Dynamic Target Acquisition Box */}
              {streamState === 'STREAMING' && (
                <div className="hud-detection-box">
                  <div className="detection-tag mono">
                    <span className="tag-label">PERIMETER TARGET</span>
                    <span className="tag-conf">94.2%</span>
                  </div>
                  <div className="box-corner c-tl" />
                  <div className="box-corner c-tr" />
                  <div className="box-corner c-bl" />
                  <div className="box-corner c-br" />
                </div>
              )}
            </div>

            {/* Bottom HUD Controls Toolbar */}
            <div className="hud-bottom-bar">
              <div className="hud-controls-left">
                <button 
                  className={`hud-btn ${isRecording ? 'recording' : ''}`}
                  onClick={onToggleRecording}
                  title={isRecording ? "Stop edge recording" : "Start local 1080p recording"}
                >
                  <Circle size={14} className={isRecording ? 'recording-dot' : ''} />
                  <span className="mono">{isRecording ? 'REC ACTIVE' : 'REC'}</span>
                </button>

                <button 
                  className="hud-btn"
                  onClick={onSnapshot}
                  title="Capture full-res snapshot and trigger AI inference"
                >
                  <Camera size={14} />
                  <span className="mono">SNAP</span>
                </button>

                <button 
                  className={`hud-btn ${claheActive ? 'active' : ''}`}
                  onClick={onToggleClahe}
                  title="Toggle CLAHE Low-Light Adaptive Luminance"
                >
                  <Sparkles size={14} />
                  <span className="mono">CLAHE</span>
                </button>

                <button 
                  className="hud-btn"
                  onClick={toggleStreamPlay}
                  title={streamActive ? "Pause stream" : "Resume stream"}
                >
                  {streamActive ? <Pause size={14} /> : <Play size={14} />}
                </button>

                <button 
                  className="hud-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              <div className="hud-controls-right">
                <div className="signal-quality mono" title="Bitrate & Sensor Stream Latency">
                  <span>LATENCY: 38ms</span>
                  <span className="hud-divider">|</span>
                  <span>BITRATE: 4.8 Mb/s</span>
                </div>

                <button 
                  className="hud-btn icon-only"
                  onClick={handleFullscreenToggle}
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
