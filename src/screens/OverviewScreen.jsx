import React from 'react';
import LivePlayer from '../components/LivePlayer';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import { 
  Camera, 
  Film, 
  Cpu, 
  Thermometer, 
  HardDrive, 
  Wifi, 
  Sparkles,
  ArrowRight,
  Clock
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
  const camStatus = deviceStatus?.camera_status || deviceStatus?.cameraStatus || (isOnline ? 'ONLINE' : 'OFFLINE');
  const resolution = deviceStatus?.stream_resolution || deviceStatus?.streamResolution || '1280x720';
  const fps = deviceStatus?.stream_fps || deviceStatus?.streamFps || (isOnline ? 15 : 0);

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="overview-container">
      {/* Top Device Hardware Summary Strip */}
      <section className="node-hero-strip glass-panel">
        <div className="node-title-col">
          <div className="node-badge-row">
            <span className="node-name">{deviceStatus?.device_name || deviceStatus?.name || 'NOCTURPOD // α-1'}</span>
            <StatusBadge status={isOnline ? 'ONLINE' : 'OFFLINE'} size="small" />
          </div>
          <span className="node-spec mono">
            {deviceStatus?.hardware_model || 'Raspberry Pi 4 Model B 8GB'} • {deviceStatus?.camera_model || 'OV5647 IR-Cut'} • 850nm IR Illumination
          </span>
        </div>

        <div className="node-status-grid">
          <div className="status-item">
            <span className="item-label mono">CAMERA</span>
            <span className={`item-val mono ${camStatus === 'ONLINE' ? 'active' : ''}`}>{camStatus}</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">CPU TEMP</span>
            <span className="item-val mono">
              {deviceStatus?.cpu_temp_c != null ? `${deviceStatus.cpu_temp_c}°C` : 'N/A'}
            </span>
          </div>
          <div className="status-item">
            <span className="item-label mono">STORAGE</span>
            <span className="item-val mono">
              {deviceStatus?.storage_used_gb != null ? `${deviceStatus.storage_used_gb} GB` : 'N/A'}
            </span>
          </div>
          <div className="status-item">
            <span className="item-label mono">NETWORK</span>
            <span className={`item-val mono ${deviceStatus?.wifi_status === 'CONNECTED' ? 'active' : ''}`}>
              {deviceStatus?.wifi_status || 'DISCONNECTED'}
            </span>
          </div>
          <div className="status-item">
            <span className="item-label mono">UPTIME</span>
            <span className="item-val mono">{formatUptime(deviceStatus?.uptime_seconds)}</span>
          </div>
        </div>
      </section>

      {/* Main Hero & Live Feed Section */}
      <div className="overview-main-layout">
        <div className="overview-left-col">
          <div className="feed-card-header">
            <div className="feed-title-wrap">
              <span className="feed-title">REAL CAMERA FEED</span>
              <span className="feed-meta mono">{resolution} • {fps} FPS</span>
            </div>
            <button 
              className="expand-monitor-btn mono"
              onClick={() => onNavigate('live')}
            >
              <span>OPEN MONITOR</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <LivePlayer 
            onSnapshot={onSnapshot}
            isRecording={isRecording}
            onToggleRecording={onToggleRecording}
            cameraStatus={camStatus}
            streamResolution={resolution}
            streamFps={fps}
          />
        </div>

        {/* Right side operational metrics */}
        <div className="overview-right-col">
          <div className="metrics-column">
            <MetricCard 
              label="TOTAL CAPTURES"
              value={capturesCount}
              subtext="Original + AI Enhanced Stills"
              icon={Camera}
              trend="ACTIVE"
            />
            <MetricCard 
              label="TOTAL RECORDINGS"
              value={recordingsCount}
              subtext="Original + AI Enhanced Clips"
              icon={Film}
              trend="ACTIVE"
            />
            <MetricCard 
              label="CPU UTILIZATION"
              value={deviceStatus?.cpu_usage_percent != null ? `${deviceStatus.cpu_usage_percent}%` : 'N/A'}
              subtext="Broadcom BCM2711 ARM64"
              icon={Cpu}
            />
            <MetricCard 
              label="RAM USAGE"
              value={deviceStatus?.ram_usage_percent != null ? `${deviceStatus.ram_usage_percent}%` : 'N/A'}
              subtext="System Memory Active"
              icon={HardDrive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
