import React from 'react';
import LivePlayer from '../components/LivePlayer';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import { 
  Camera, 
  Film, 
  Cpu, 
  HardDrive, 
  ArrowRight
} from 'lucide-react';
import './OverviewScreen.css';

export default function OverviewScreen({ 
  deviceStatus, 
  capturesCount = 0,
  recordingsCount = 0,
  onNavigate,
  onSnapshot,
  isRecording,
  onToggleRecording
}) {
  const isOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const camStatus = deviceStatus?.camera_status || 'N/A';
  const resolution = deviceStatus?.stream_resolution || 'N/A';
  const fps = isOnline && deviceStatus?.stream_fps != null ? `${deviceStatus.stream_fps} FPS` : 'N/A';

  const formatUptime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const cpuTemp = deviceStatus?.cpu_temp_c != null ? `${deviceStatus.cpu_temp_c}°C` : 'N/A';
  const storage = deviceStatus?.storage_used_gb != null 
    ? `${deviceStatus.storage_used_gb} GB${deviceStatus?.storage_total_gb != null ? ` / ${deviceStatus.storage_total_gb} GB` : ''}` 
    : 'N/A';
  const network = deviceStatus?.wifi_status || 'N/A';
  const uptime = formatUptime(deviceStatus?.uptime_seconds);

  return (
    <div className="overview-container">
      {/* Top Device Hardware Summary Strip */}
      <section className="node-hero-strip glass-panel">
        <div className="node-title-col">
          <span className="strip-kicker mono">AUTHENTIC EDGE TELEMETRY</span>
          <div className="node-badge-row">
            <span className="node-name">{deviceStatus?.device_name || deviceStatus?.device_id || 'NOCTURPOD EDGE NODE'}</span>
            <StatusBadge status={isOnline ? (deviceStatus?.status || 'ONLINE') : 'OFFLINE'} size="small" />
          </div>
        </div>

        <div className="node-status-grid">
          <div className="status-item">
            <span className="item-label mono">CAMERA</span>
            <span className={`item-val mono ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
          </div>

          <div className="status-item">
            <span className="item-label mono">CPU TEMP</span>
            <span className={`item-val mono ${cpuTemp !== 'N/A' ? 'active' : ''}`}>{cpuTemp}</span>
          </div>

          <div className="status-item">
            <span className="item-label mono">STORAGE</span>
            <span className="item-val mono">{storage}</span>
          </div>

          <div className="status-item">
            <span className="item-label mono">NETWORK</span>
            <span className={`item-val mono ${network === 'CONNECTED' ? 'active' : ''}`}>{network}</span>
          </div>

          <div className="status-item">
            <span className="item-label mono">UPTIME</span>
            <span className="item-val mono">{uptime}</span>
          </div>
        </div>
      </section>

      {/* Main Hero & Live Feed Section */}
      <div className="overview-main-layout">
        <div className="overview-left-col">
          <div className="feed-card-header">
            <div className="feed-title-wrap">
              <span className="feed-title">REAL CAMERA FEED</span>
              <span className="feed-meta mono">
                {resolution !== 'N/A' ? resolution : ''}{resolution !== 'N/A' && fps !== 'N/A' ? ' • ' : ''}{fps !== 'N/A' ? fps : ''}
              </span>
            </div>
            <button 
              className="expand-monitor-btn mono"
              onClick={() => onNavigate('live')}
            >
              <span>EXPAND MONITOR</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <LivePlayer 
            onSnapshot={onSnapshot}
            isRecording={isRecording}
            onToggleRecording={onToggleRecording}
            cameraStatus={camStatus}
            streamResolution={deviceStatus?.stream_resolution}
            streamFps={deviceStatus?.stream_fps}
          />
        </div>

        {/* Right side operational metrics */}
        <div className="overview-right-col">
          <div className="metrics-column">
            <MetricCard 
              label="CAPTURES"
              value={capturesCount}
              subtext="Real Stills in Supabase"
              icon={Camera}
            />
            <MetricCard 
              label="RECORDINGS"
              value={recordingsCount}
              subtext="Real Footage Clips"
              icon={Film}
            />
            <MetricCard 
              label="CPU"
              value={deviceStatus?.cpu_usage_percent != null ? `${deviceStatus.cpu_usage_percent}%` : 'N/A'}
              subtext="Telemetry Load"
              icon={Cpu}
            />
            <MetricCard 
              label="RAM"
              value={deviceStatus?.ram_usage_percent != null ? `${deviceStatus.ram_usage_percent}%` : 'N/A'}
              subtext="Memory Allocated"
              icon={HardDrive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
