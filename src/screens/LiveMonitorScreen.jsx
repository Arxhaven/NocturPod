import React from 'react';
import LivePlayer from '../components/LivePlayer';
import {
  Activity,
  Check,
  Cpu,
  Moon,
  Radio,
  Sun,
  Wifi
} from 'lucide-react';
import './LiveMonitorScreen.css';

function DetailRow({ label, value, tone = '' }) {
  return (
    <div className="live-detail-row">
      <span>{label}</span>
      <strong className={tone}>{value || '—'}</strong>
    </div>
  );
}

export default function LiveMonitorScreen({
  deviceStatus,
  onSnapshot,
  isRecording,
  onToggleRecording,
  onToggleLightMode,
  isSwitchingLight = false
}) {
  const deviceState = String(deviceStatus?.status || 'OFFLINE').toUpperCase();
  const isOnline = deviceState === 'ONLINE' || deviceState === 'RECORDING';
  const cameraState = String(deviceStatus?.camera_status || 'UNKNOWN').toUpperCase();
  const resolution = deviceStatus?.stream_resolution || '—';
  const fps = deviceStatus?.stream_fps != null ? `${deviceStatus.stream_fps} FPS` : '—';
  const lightMode = String(deviceStatus?.light_mode || deviceStatus?.lightMode || 'WHITE').toUpperCase();
  const storage = deviceStatus?.storage_used_gb != null
    ? `${deviceStatus.storage_used_gb} GB${deviceStatus?.storage_total_gb != null ? ` / ${deviceStatus.storage_total_gb} GB` : ''}`
    : '—';

  return (
    <div className="live-monitor-container">
      <header className="live-page-header">
        <div>
          <div className="live-eyebrow">NOCTURPOD <span>/</span> CAMERA</div>
          <div className="live-title-row">
            <h1>Live monitor</h1>
            <span className={`live-status-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
              <span className="live-status-dot" />{isOnline ? 'Device online' : 'Device offline'}
            </span>
          </div>
          <p>Monitor the live stream and manage camera illumination.</p>
        </div>
        <div className="live-header-meta">
          <span><Radio size={14} /> {resolution}</span>
          <span><Activity size={14} /> {fps}</span>
        </div>
      </header>

      <div className="live-monitor-grid">
        <section className="live-preview-surface">
          <div className="live-preview-header">
            <div>
              <span className="live-section-eyebrow">LIVE FEED</span>
              <h2>Camera stream</h2>
            </div>
            <div className="live-preview-status">
              <span className={`live-status-dot ${cameraState === 'ONLINE' ? 'good' : 'muted'}`} />
              <span>{cameraState === 'ONLINE' ? 'Camera ready' : 'Camera status: ' + cameraState.toLowerCase().replaceAll('_', ' ')}</span>
            </div>
          </div>
          <LivePlayer
            onSnapshot={onSnapshot}
            isRecording={isRecording}
            onToggleRecording={onToggleRecording}
            cameraStatus={cameraState}
            streamResolution={deviceStatus?.stream_resolution}
            streamFps={deviceStatus?.stream_fps}
          />
          <div className="live-preview-caption">
            <span>Commands are sent to the edge node. The feed remains unavailable until the camera stream is online.</span>
          </div>
        </section>

        <aside className="live-side-stack">
          <section className="live-panel">
            <div className="live-panel-header">
              <div>
                <span className="live-section-eyebrow">EDGE NODE</span>
                <h2>System status</h2>
              </div>
              <span className={`live-compact-state ${isOnline ? 'is-online' : 'is-offline'}`}>
                <span className="live-status-dot" />{isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="live-node-identity">
              <span className="live-node-icon"><Cpu size={17} /></span>
              <div>
                <strong>{deviceStatus?.device_name || deviceStatus?.device_id || 'nocturpod-edge-01'}</strong>
                <span>{deviceStatus?.hardware_model || 'Raspberry Pi 4 Model B'}</span>
              </div>
            </div>

            <div className="live-details-list">
              <DetailRow label="Camera" value={cameraState} tone={cameraState === 'ONLINE' ? 'good' : ''} />
              <DetailRow label="Connection" value={String(deviceStatus?.wifi_status || 'UNKNOWN').replaceAll('_', ' ')} tone={['CONNECTED', 'ONLINE'].includes(String(deviceStatus?.wifi_status || '').toUpperCase()) ? 'good' : ''} />
              <DetailRow label="Resolution" value={resolution} />
              <DetailRow label="Frame rate" value={fps} />
              <DetailRow label="Recording" value={isRecording ? 'In progress' : 'Not recording'} tone={isRecording ? 'recording' : ''} />
              <DetailRow label="Storage" value={storage} />
            </div>
          </section>

          <section className="live-panel illumination-panel">
            <div className="live-panel-header">
              <div>
                <span className="live-section-eyebrow">CAMERA CONTROL</span>
                <h2>Illumination</h2>
              </div>
              <span className="live-current-mode">{lightMode === 'NIGHT' ? 'Night mode' : 'White light'}</span>
            </div>
            <p className="live-panel-description">Choose the lighting profile used by the edge device.</p>

            <div className="live-light-options" role="group" aria-label="Illumination mode">
              <button
                type="button"
                className={`live-light-option ${lightMode === 'WHITE' ? 'selected' : ''}`}
                onClick={() => onToggleLightMode?.('WHITE')}
                disabled={isSwitchingLight || !isOnline || lightMode === 'WHITE'}
                aria-pressed={lightMode === 'WHITE'}
              >
                <span className="live-light-option-icon"><Sun size={17} /></span>
                <span className="live-light-option-copy"><strong>White light</strong><small>Mode A</small></span>
                {lightMode === 'WHITE' && <Check size={15} className="live-light-check" />}
              </button>
              <button
                type="button"
                className={`live-light-option ${lightMode === 'NIGHT' ? 'selected night' : ''}`}
                onClick={() => onToggleLightMode?.('NIGHT')}
                disabled={isSwitchingLight || !isOnline || lightMode === 'NIGHT'}
                aria-pressed={lightMode === 'NIGHT'}
              >
                <span className="live-light-option-icon"><Moon size={17} /></span>
                <span className="live-light-option-copy"><strong>Night mode</strong><small>Mode B</small></span>
                {lightMode === 'NIGHT' && <Check size={15} className="live-light-check" />}
              </button>
            </div>
            {!isOnline && <div className="live-inline-note"><Wifi size={14} /> Connect the edge node to enable controls.</div>}
            {isSwitchingLight && <div className="live-inline-note"><Activity size={14} /> Sending lighting command…</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
