import React, { useState, useEffect, useRef } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Camera, 
  Circle, 
  RefreshCw,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { BACKEND_HOST, fetchStreamStatus } from '../services/api';
import './LivePlayer.css';

export default function LivePlayer({ 
  onSnapshot, 
  isRecording, 
  onToggleRecording, 
  cameraStatus = 'OFFLINE',
  streamResolution,
  streamFps
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudTimestamp, setHudTimestamp] = useState('');
  const [streamState, setStreamState] = useState('CONNECTING'); // 'CONNECTING' | 'STREAMING' | 'OFFLINE'
  const [streamKey, setStreamKey] = useState(Date.now());
  const [liveMetrics, setLiveMetrics] = useState({ fps: streamFps, resolution: streamResolution });
  const containerRef = useRef(null);

  // Update live HUD clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setHudTimestamp(now.toTimeString().split(' ')[0] + '.' + String(Math.floor(now.getMilliseconds() / 100)));
    };
    updateTime();
    const timer = setInterval(updateTime, 100);
    return () => clearInterval(timer);
  }, []);

  // Poll backend stream status periodically to verify real live stream parameters
  useEffect(() => {
    let isMounted = true;
    const checkStream = async () => {
      const status = await fetchStreamStatus();
      if (!isMounted) return;
      if (status) {
        setLiveMetrics({
          fps: status.fps ?? null,
          resolution: status.resolution ?? null
        });
        if (status.status === 'WAITING_FOR_CAMERA' && streamState === 'STREAMING') {
          setStreamState('OFFLINE');
        }
      }
    };
    checkStream();
    const interval = setInterval(checkStream, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [streamState]);

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

  const displayResolution = liveMetrics.resolution || streamResolution || 'N/A';
  const rawFps = liveMetrics.fps ?? streamFps;
  const displayFps = streamState === 'STREAMING' && rawFps != null 
    ? `${rawFps} FPS` 
    : (streamState === 'STREAMING' ? 'LIVE' : '0 FPS');

  return (
    <div className={`live-player-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={containerRef}>
      <div className="player-inner">
        <div className="video-stream-container">
          {/* Strictly genuine backend MJPEG stream */}
          <img 
            key={streamKey}
            src={`${BACKEND_HOST}/api/stream/live?t=${streamKey}`}
            alt="NocturPod Live OV5647 Stream"
            className={`live-video-element ${streamState === 'STREAMING' ? 'visible' : 'hidden'}`}
            onLoad={() => setStreamState('STREAMING')}
            onError={() => setStreamState('OFFLINE')}
          />

          {/* Connecting State */}
          {streamState === 'CONNECTING' && (
            <div className="stream-state-overlay connecting">
              <div className="state-card glass-panel">
                <Loader2 size={32} className="spin-icon" />
                <h3 className="state-title">CONNECTING TO CAMERA FEED</h3>
                <p className="state-sub mono">
                  Establishing direct stream link with NocturPod edge node...
                </p>
              </div>
            </div>
          )}

          {/* Honest Stream Offline State */}
          {streamState === 'OFFLINE' && (
            <div className="stream-state-overlay offline">
              <div className="state-card glass-panel">
                <AlertCircle size={36} className="offline-icon" />
                <h3 className="state-title">CAMERA FEED UNAVAILABLE</h3>
                <p className="state-sub mono">
                  WAITING FOR RASPBERRY PI STREAM
                </p>
                <button className="stream-reconnect-btn mono" onClick={handleReconnect}>
                  <RefreshCw size={13} />
                  <span>RECONNECT STREAM</span>
                </button>
              </div>
            </div>
          )}

          {/* Genuine Camera Stream HUD Overlay */}
          <div className="stream-hud-overlay">
            <div className="hud-top-bar">
              <div className="hud-left-meta">
                <div className={`live-status-pill ${streamState.toLowerCase()}`}>
                  <span className="live-dot" />
                  <span className="live-text mono">
                    {streamState === 'STREAMING' 
                      ? 'OV5647 LIVE' 
                      : streamState === 'CONNECTING' 
                        ? 'CONNECTING' 
                        : 'STREAM OFFLINE'}
                  </span>
                </div>
                <span className="hud-cam-model mono">OV5647 IR-CUT</span>
              </div>

              <div className="hud-right-meta mono">
                <span className="hud-clock">{hudTimestamp}</span>
                <span className="hud-res">{displayResolution}</span>
                {streamState === 'STREAMING' && (
                  <span className="hud-fps">{displayFps}</span>
                )}
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
              title="Capture real still frame from edge node"
            >
              <Camera size={15} />
              <span>CAPTURE</span>
            </button>

            <button 
              className={`dock-action-btn record-btn ${isRecording ? 'recording' : ''}`}
              onClick={() => onToggleRecording(!isRecording)}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              <Circle size={14} fill={isRecording ? "currentColor" : "none"} />
              <span>{isRecording ? "STOP RECORDING" : "START RECORDING"}</span>
            </button>
          </div>

          <div className="dock-center mono">
            <span className="feed-status-tag">
              STREAM: <strong className={`status-${streamState.toLowerCase()}`}>{streamState}</strong>
            </span>
          </div>

          <div className="dock-right">
            <button 
              className="dock-tool-btn"
              onClick={handleReconnect}
              title="Refresh Camera Feed"
            >
              <RefreshCw size={15} />
            </button>

            <button 
              className="dock-tool-btn"
              onClick={handleFullscreenToggle}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
