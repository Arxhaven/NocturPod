import React, { useState, useEffect, useRef } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Camera, 
  Circle, 
  Volume2, 
  VolumeX, 
  Sparkles,
  RefreshCw,
  VideoOff,
  Radio
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { getStreamUrl, fetchStreamStatus, isRecordingSupported } from '../services/api';
import './LivePlayer.css';

export default function LivePlayer({ 
  onSnapshot, 
  isCapturing = false,
  isRecording = false, 
  onToggleRecording, 
  claheActive = true, 
  onToggleClahe,
  irNightMode = 'AUTO_ACTIVE',
  deviceStatus,
  onShowToast
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [fps, setFps] = useState(deviceStatus?.streamFps ?? 0);
  const [hudTimestamp, setHudTimestamp] = useState('');
  const [streamInfo, setStreamInfo] = useState(null);
  const containerRef = useRef(null);

  // Streaming lifecycle states
  const isOnline = deviceStatus?.status === 'ONLINE';
  const [streamPath, setStreamPath] = useState('/api/stream/live');
  const [streamKey, setStreamKey] = useState(Date.now());
  const [streamState, setStreamState] = useState('checking');

  // Check stream status from backend
  const checkStream = async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    try {
      const statusData = await fetchStreamStatus();
      if (statusData) {
        setStreamInfo(statusData);
        if (statusData.fps != null) setFps(statusData.fps);

        if (statusData.camera_status === 'ONLINE' || statusData.status === 'ACTIVE' || statusData.status === 'STREAMING') {
          if (streamState !== 'streaming' && streamState !== 'loading') {
            setStreamState('loading');
            setStreamKey(Date.now());
          }
        } else if (statusData.status === 'WAITING_FOR_CAMERA' || statusData.camera_status === 'OFFLINE') {
          setStreamState('waiting');
        }
      } else if (!isOnline) {
        setStreamState('offline');
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    checkStream();
    const timer = setInterval(checkStream, 12000);
    return () => clearInterval(timer);
  }, [isOnline]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setHudTimestamp(now.toTimeString().split(' ')[0] + '.' + String(Math.floor(now.getMilliseconds() / 100)));
    };
    updateTime();
    const timer = setInterval(updateTime, 500);
    return () => clearInterval(timer);
  }, []);

  const handleFullscreenToggle = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleStreamError = () => {
    // If stream fails, check if camera is offline on backend
    if (streamInfo?.status === 'WAITING_FOR_CAMERA' || streamInfo?.camera_status === 'OFFLINE') {
      setStreamState('waiting');
    } else if (streamPath === '/api/stream/live') {
      // Try fallback to /stream
      setStreamPath('/stream');
      setStreamKey(Date.now());
    } else {
      setStreamState('error');
    }
  };

  const handleReconnectStream = () => {
    setStreamState('loading');
    setStreamKey(Date.now());
    checkStream();
  };

  const handleRecordClick = () => {
    if (!isRecordingSupported()) {
      if (onShowToast) {
        onShowToast("Edge recording not supported on current backend.");
      }
      return;
    }
    if (onToggleRecording) {
      onToggleRecording();
    }
  };

  const currentStreamUrl = (streamState === 'loading' || streamState === 'streaming')
    ? `${getStreamUrl(streamPath)}?_cb=${streamKey}`
    : '';

  return (
    <div className={`live-player-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={containerRef}>
      <div className="player-inner">
        <div className="video-stream-container">
          {/* Live MJPEG Optical Feed */}
          {(streamState === 'streaming' || streamState === 'loading') && (
            <img 
              key={`${streamPath}-${streamKey}`}
              src={currentStreamUrl}
              alt="NocturPod Live Optical Feed"
              className={`live-video-element ${claheActive ? 'clahe-filter-enhanced' : ''}`}
              onLoad={() => setStreamState('streaming')}
              onError={handleStreamError}
              style={{ 
                display: streamState === 'streaming' ? 'block' : 'none',
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          )}

          {/* Loading Indicator */}
          {streamState === 'loading' && (
            <div 
              className="stream-loading-overlay mono"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: '#041213',
                color: 'var(--color-muted-sage)',
                zIndex: 2
              }}
            >
              <RefreshCw size={28} className="spin-icon" style={{ opacity: 0.8 }} />
              <span style={{ fontSize: '12px', letterSpacing: '0.08em' }}>
                CONNECTING OPTICAL STREAM ({streamPath})...
              </span>
            </div>
          )}

          {/* Standby / Waiting for Camera Screen */}
          {streamState === 'waiting' && (
            <div 
              className="stream-offline-screen mono"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: 'radial-gradient(circle, rgba(11, 43, 38, 0.6) 0%, rgba(4, 18, 19, 0.98) 100%)',
                color: 'var(--color-muted-sage)',
                padding: '20px',
                textAlign: 'center'
              }}
            >
              <Radio size={36} style={{ opacity: 0.6, color: '#faad14' }} />
              <span style={{ fontSize: '13px', letterSpacing: '0.08em', color: '#faad14', fontWeight: 600 }}>
                WAITING FOR CAMERA STREAM
              </span>
              <span style={{ fontSize: '11px', maxWidth: '440px', lineHeight: 1.5, opacity: 0.85 }}>
                Cloud gateway is online, but edge camera is currently {streamInfo?.camera_status || 'OFFLINE'} ({streamInfo?.status || 'WAITING_FOR_CAMERA'}). Stream will activate automatically when hardware stream frames arrive.
              </span>
              <button
                type="button"
                onClick={handleReconnectStream}
                className="mono"
                style={{
                  background: 'rgba(250, 173, 20, 0.15)',
                  border: '1px solid #faad14',
                  color: '#faad14',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '6px'
                }}
              >
                <RefreshCw size={12} />
                <span>POLL STREAM STATUS</span>
              </button>
            </div>
          )}

          {/* Error Screen */}
          {streamState === 'error' && (
            <div 
              className="stream-error-overlay mono"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                background: 'radial-gradient(circle, rgba(11, 43, 38, 0.9) 0%, rgba(4, 18, 19, 0.98) 100%)',
                color: '#ff7875',
                zIndex: 2,
                padding: '20px',
                textAlign: 'center'
              }}
            >
              <VideoOff size={34} style={{ opacity: 0.8 }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                OPTICAL STREAM UNAVAILABLE
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-muted-sage)', maxWidth: '420px', lineHeight: 1.5 }}>
                Could not connect to MJPEG stream endpoint ({streamPath}). Ensure the edge camera daemon is running on the Raspberry Pi.
              </span>
              <button
                type="button"
                onClick={handleReconnectStream}
                className="mono"
                style={{
                  background: 'rgba(255, 77, 79, 0.2)',
                  border: '1px solid #ff7875',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={12} />
                <span>RECONNECT FEED</span>
              </button>
            </div>
          )}

          {/* Standby / Offline Screen when backend itself is unreachable */}
          {(streamState === 'offline' || streamState === 'checking') && (
            <div 
              className="stream-offline-screen mono"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: 'radial-gradient(circle, rgba(11, 43, 38, 0.4) 0%, rgba(4, 18, 19, 0.95) 100%)',
                color: 'var(--color-muted-sage)'
              }}
            >
              <VideoOff size={36} style={{ opacity: 0.5 }} />
              <span style={{ fontSize: '13px', letterSpacing: '0.1em', color: 'var(--color-light-green)' }}>
                NOCTURPOD // OPTICAL FEED STANDBY
              </span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>
                OV5647 SENSOR STANDBY • AWAITING EDGE HARDWARE CONNECTION
              </span>
            </div>
          )}

          {/* Low light night vision noise / grain overlay */}
          <div className="night-vision-grain" />

          {/* Aerospace HUD Overlays */}
          <div className="hud-overlay-container">
            {/* Top HUD Row */}
            <div className="hud-top-bar">
              <div className="hud-group">
                <div className={`live-pill ${streamState === 'streaming' ? 'online' : ''}`}>
                  <span className={`live-dot ${streamState === 'streaming' ? '' : 'inactive'}`} />
                  <span className="mono">
                    {streamState === 'streaming' ? 'LIVE' : (streamState === 'loading' ? 'SYNC' : 'STANDBY')}
                  </span>
                </div>
                <span className="hud-data mono">{streamInfo?.resolution || deviceStatus?.streamResolution || '1280×720'}</span>
                <span className="hud-data mono">{streamState === 'streaming' ? `${fps} FPS` : '0 FPS'}</span>
                <span className="hud-data hud-accent mono">
                  {streamInfo?.camera_status === 'ONLINE' ? 'OV5647-IR' : 'STANDBY'}
                </span>
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
            </div>

            {/* Bottom HUD Controls Toolbar */}
            <div className="hud-bottom-bar">
              <div className="hud-controls-left">
                {/* Recording Command Toggle */}
                <button 
                  type="button"
                  className={`hud-btn ${isRecording ? 'recording' : ''}`}
                  onClick={handleRecordClick}
                  title={isRecording ? "Stop edge recording" : "Queue edge recording command"}
                >
                  <Circle size={14} className={isRecording ? 'recording-dot' : ''} />
                  <span className="mono">{isRecording ? 'STOP REC' : 'START REC'}</span>
                </button>

                <button 
                  type="button"
                  className="hud-btn"
                  onClick={onSnapshot}
                  disabled={isCapturing}
                  title="Queue hardware snapshot command and await image upload"
                >
                  {isCapturing ? <RefreshCw size={14} className="spin-icon" /> : <Camera size={14} />}
                  <span className="mono">{isCapturing ? 'QUEUED' : 'SNAP'}</span>
                </button>

                <button 
                  type="button"
                  className={`hud-btn ${claheActive ? 'active' : ''}`}
                  onClick={onToggleClahe}
                  title="Toggle CLAHE Low-Light Adaptive Luminance"
                >
                  <Sparkles size={14} />
                  <span className="mono">CLAHE</span>
                </button>

                <button 
                  type="button"
                  className="hud-btn"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              <div className="hud-controls-right">
                <div className="signal-quality mono" title="Stream Transport & Status">
                  <span>STREAM: {streamState === 'streaming' ? 'MJPEG / 720p' : streamState.toUpperCase()}</span>
                </div>

                <button 
                  type="button"
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
