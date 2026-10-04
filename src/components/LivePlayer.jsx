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
  Info
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import './LivePlayer.css';

export default function LivePlayer({ 
  onSnapshot, 
  isRecording, 
  onToggleRecording, 
  claheActive = true, 
  onToggleClahe,
  irNightMode = 'AUTO_ACTIVE' 
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [fps, setFps] = useState(24);
  const [hudTimestamp, setHudTimestamp] = useState('');
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

  return (
    <div className={`live-player-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={containerRef}>
      <div className="player-inner">
        {/* Real video feed or simulated stream with low-light camera aesthetic */}
        <div className="video-stream-container">
          <video 
            className={`live-video-element ${claheActive ? 'clahe-filter-enhanced' : ''}`}
            autoPlay 
            loop 
            muted={isMuted} 
            playsInline
            poster="https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1200&q=80"
          >
            {/* High quality night ambient footage */}
            <source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" type="video/mp4" />
          </video>

          {/* Low light night vision noise / grain overlay */}
          <div className="night-vision-grain" />

          {/* Aerospace HUD Overlays */}
          <div className="hud-overlay-container">
            {/* Top HUD Row */}
            <div className="hud-top-bar">
              <div className="hud-group">
                <div className="live-pill">
                  <span className="live-dot" />
                  <span className="mono">LIVE</span>
                </div>
                <span className="hud-data mono">1920×1080</span>
                <span className="hud-data mono">{fps} FPS</span>
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

              {/* Dynamic Target Acquisition Box (Simulated edge detection) */}
              <div className="hud-detection-box">
                <div className="detection-tag mono">
                  <span className="tag-label">PERSON</span>
                  <span className="tag-conf">94.2%</span>
                </div>
                <div className="box-corner c-tl" />
                <div className="box-corner c-tr" />
                <div className="box-corner c-bl" />
                <div className="box-corner c-br" />
              </div>
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
                  <span className="mono">{isRecording ? 'REC 00:14' : 'REC'}</span>
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
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              <div className="hud-controls-right">
                <div className="signal-quality mono" title="Bitrate & Sensor Stream Latency">
                  <span>LATENCY: 42ms</span>
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
