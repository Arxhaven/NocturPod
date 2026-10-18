import React from 'react';
import LivePlayer from '../components/LivePlayer';
import {
  Activity,
  ArrowUpRight,
  Camera,
  Clock3,
  Database,
  Film,
  HardDrive,
  Thermometer,
} from 'lucide-react';
import './OverviewScreen.css';

const formatUptime = (seconds) => {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const totalMinutes = Math.floor(Number(seconds) / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const valueOrDash = (value, suffix = '') =>
  value === undefined || value === null || value === '' ? '—' : `${value}${suffix}`;

function StatusRow({ label, value, tone = '' }) {
  return (
    <div className="overview-status-row">
      <span className="overview-row-label">{label}</span>
      <span className={`overview-row-value ${tone}`}>{value || '—'}</span>
    </div>
  );
}

export default function OverviewScreen({
  deviceStatus,
  capturesCount = 0,
  recordingsCount = 0,
  onNavigate,
  onSnapshot,
  isRecording,
  onToggleRecording
}) {
  const deviceState = String(deviceStatus?.status || 'OFFLINE').toUpperCase();
  const isOnline = deviceState === 'ONLINE' || deviceState === 'RECORDING';
  const cameraState = String(deviceStatus?.camera_status || 'UNKNOWN').toUpperCase();
  const networkState = String(deviceStatus?.wifi_status || 'UNKNOWN').toUpperCase();
  const resolution = deviceStatus?.stream_resolution || '—';
  const fps = deviceStatus?.stream_fps != null ? `${deviceStatus.stream_fps} FPS` : '—';
  const storage = deviceStatus?.storage_used_gb != null
    ? `${deviceStatus.storage_used_gb} GB${deviceStatus?.storage_total_gb != null ? ` / ${deviceStatus.storage_total_gb} GB` : ''}`
    : '—';
  const deviceName = deviceStatus?.device_name || deviceStatus?.device_id || 'NocturPod edge node';
  const uptime = formatUptime(deviceStatus?.uptime_seconds);

  const metrics = [
    { label: 'Image captures', value: Number(capturesCount).toLocaleString(), note: 'In media archive', Icon: Camera },
    { label: 'Video recordings', value: Number(recordingsCount).toLocaleString(), note: 'Available to review', Icon: Film },
    { label: 'Processor temperature', value: valueOrDash(deviceStatus?.cpu_temp_c, '°C'), note: 'Raspberry Pi CPU', Icon: Thermometer },
    { label: 'Device uptime', value: uptime, note: 'Since last boot', Icon: Clock3 }
  ];

  return (
    <div className="overview-container">
      <header className="overview-page-header">
        <div className="overview-heading-copy">
          <div className="overview-eyebrow">NOCTURPOD <span>/</span> CONTROL CENTER</div>
          <div className="overview-title-row">
            <h1>Overview</h1>
            <span className={`overview-status-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
              <span className="overview-status-dot" />
              {isOnline ? 'Device online' : 'Device offline'}
            </span>
          </div>
          <p>A clear view of your edge device, live camera, and recent media.</p>
        </div>
        <button type="button" className="overview-primary-link" onClick={() => onNavigate?.('live')}>
          Open live monitor <ArrowUpRight size={16} />
        </button>
      </header>

      <section className="overview-metrics-grid" aria-label="Device summary">
        {metrics.map(({ label, value, note, Icon }) => (
          <article className="overview-metric-card" key={label}>
            <div className="overview-metric-top">
              <span className="overview-metric-label">{label}</span>
              <span className="overview-metric-icon"><Icon size={17} strokeWidth={1.8} /></span>
            </div>
            <div className="overview-metric-value">{value}</div>
            <div className="overview-metric-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="overview-main-layout">
        <article className="overview-surface overview-feed-panel">
          <div className="overview-section-header">
            <div>
              <div className="overview-section-eyebrow">CAMERA</div>
              <h2>Live preview</h2>
            </div>
            <div className="overview-stream-meta">
              <span>{resolution}</span>
              <span className="overview-meta-divider" />
              <span>{fps}</span>
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
          <div className="overview-feed-footer">
            <span className="overview-feed-footer-copy">
              <Activity size={14} /> Live feed from the NocturPod edge node
            </span>
            <button type="button" className="overview-text-link" onClick={() => onNavigate?.('live')}>
              Full controls <ArrowUpRight size={14} />
            </button>
          </div>
        </article>

        <aside className="overview-side-stack">
          <article className="overview-surface overview-device-panel">
            <div className="overview-section-header compact">
              <div>
                <div className="overview-section-eyebrow">SYSTEM</div>
                <h2>Device health</h2>
              </div>
              <span className={`overview-status-pill small ${isOnline ? 'is-online' : 'is-offline'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="overview-device-name">
              <span className="overview-device-icon"><HardDrive size={17} /></span>
              <div>
                <strong>{deviceName}</strong>
                <span>{deviceStatus?.hardware_model || 'Raspberry Pi edge device'}</span>
              </div>
            </div>

            <div className="overview-status-list">
              <StatusRow label="Camera" value={cameraState} tone={cameraState === 'ONLINE' ? 'good' : ''} />
              <StatusRow label="Network" value={networkState.replaceAll('_', ' ')} tone={networkState === 'CONNECTED' || networkState === 'ONLINE' ? 'good' : ''} />
              <StatusRow label="Storage used" value={storage} />
              <StatusRow label="CPU load" value={valueOrDash(deviceStatus?.cpu_usage_percent, '%')} />
              <StatusRow label="Memory usage" value={valueOrDash(deviceStatus?.ram_usage_percent, '%')} />
            </div>
          </article>

          <article className="overview-surface overview-shortcuts-panel">
            <div className="overview-section-eyebrow">MEDIA LIBRARY</div>
            <h2>Your recent captures</h2>
            <p>Review original files and their enhanced versions in one place.</p>
            <button type="button" className="overview-shortcut-row" onClick={() => onNavigate?.('images')}>
              <span className="overview-shortcut-icon"><Camera size={16} /></span>
              <span><strong>Images</strong><small>{Number(capturesCount).toLocaleString()} available</small></span>
              <ArrowUpRight size={15} />
            </button>
            <button type="button" className="overview-shortcut-row" onClick={() => onNavigate?.('footage')}>
              <span className="overview-shortcut-icon"><Film size={16} /></span>
              <span><strong>Videos</strong><small>{Number(recordingsCount).toLocaleString()} available</small></span>
              <ArrowUpRight size={15} />
            </button>
            <div className="overview-storage-note"><Database size={14} /> Media records synced from the backend</div>
          </article>
        </aside>
      </section>
    </div>
  );
}
