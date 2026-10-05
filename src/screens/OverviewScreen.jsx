import React from 'react';
import LivePlayer from '../components/LivePlayer';
import MetricCard from '../components/MetricCard';
import EventTimeline from '../components/EventTimeline';
import StatusBadge from '../components/StatusBadge';
import { 
  Activity, 
  Camera, 
  Film, 
  Cpu, 
  Clock, 
  ShieldCheck, 
  HardDrive, 
  Battery, 
  Wifi, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import './OverviewScreen.css';

export default function OverviewScreen({ 
  deviceStatus, 
  metrics, 
  events, 
  onSelectEvent, 
  onNavigate,
  onSnapshot,
  isRecording,
  onToggleRecording,
  claheActive,
  onToggleClahe
}) {
  return (
    <div className="overview-container">
      {/* Top Device Hardware Summary Strip */}
      <section className="node-hero-strip glass-panel">
        <div className="node-title-col">
          <div className="node-badge-row">
            <span className="node-name">NOCTURPOD // α-1</span>
            <StatusBadge status={deviceStatus?.status ?? 'ONLINE'} size="small" />
          </div>
          <span className="node-spec mono">RPI4-B (8GB) • OV5647 IR-CUT • 850nm DUAL MATRIX • 20,000mAh UNIT</span>
        </div>

        <div className="node-status-grid">
          <div className="status-item">
            <span className="item-label mono">CAMERA</span>
            <span className="item-val mono active">{deviceStatus?.cameraStatus ?? 'ONLINE'}</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">SPOOL BUFFER</span>
            <span className="item-val mono active">ARMED (Nominal)</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">STORAGE</span>
            <span className="item-val mono">{deviceStatus?.storageUsedGB ?? 18.4} / 64 GB</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">POWER BANK</span>
            <span className="item-val mono">{deviceStatus?.batteryPercent ?? 88}% ({deviceStatus?.batteryVoltage ?? '11.8V'})</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">NETWORK</span>
            <span className="item-val mono active">{deviceStatus?.wifiStatus ?? 'CONNECTED'} (-58 dBm)</span>
          </div>
          <div className="status-item">
            <span className="item-label mono">AI PIPELINE</span>
            <span className="item-val mono active">NCNN INT8 ACTIVE</span>
          </div>
        </div>
      </section>

      {/* Main Hero & Live Feed Section */}
      <div className="overview-main-layout">
        <div className="overview-left-col">
          <div className="feed-card-header">
            <div className="feed-title-wrap">
              <span className="feed-title">PRIMARY LIVE SURVEILLANCE FEED</span>
              <span className="feed-meta mono">SECTOR ALPHA (ENTRYWAY)</span>
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
            claheActive={claheActive}
            onToggleClahe={onToggleClahe}
            irNightMode={deviceStatus?.irNightMode ?? 'AUTO_ACTIVE'}
            streamResolution={deviceStatus?.streamResolution ?? '1920×1080'}
            cameraStatus={deviceStatus?.cameraStatus ?? 'ONLINE'}
          />

          {/* Under-feed compact metric blocks */}
          <div className="metrics-grid">
            <MetricCard 
              label="MOTION EVENTS TODAY" 
              value={metrics?.motionEventsToday ?? 19} 
              subtext="Edge vision triggers"
              icon={Activity}
              trend="+3 in last hour"
            />
            <MetricCard 
              label="CAPTURES TODAY" 
              value={metrics?.capturesToday ?? 42} 
              subtext="Full resolution frames"
              icon={Camera}
              trend="100% written"
            />
            <MetricCard 
              label="RECORDED MINUTES" 
              value={`${metrics?.recordedMinutesToday ?? 68}m`} 
              subtext="1080p H.264 footage"
              icon={Film}
              trend="38.4 GB free"
            />
            <MetricCard 
              label="AI DETECTIONS" 
              value={metrics?.aiDetectionsToday ?? 31} 
              subtext="YOLOv8 Edge inference"
              icon={Cpu}
              trend="38ms avg"
            />
            <MetricCard 
              label="DEVICE UPTIME" 
              value={metrics?.uptimeStr ?? "2d 06h"} 
              subtext="Thermal 44.8°C (Nominal)"
              icon={Clock}
              trend="99.4% stability"
            />
          </div>
        </div>

        {/* Right side Live Event Timeline */}
        <div className="overview-right-col">
          <div className="timeline-panel glass-panel">
            <div className="timeline-header">
              <div className="th-title-group">
                <span className="th-title">LIVE EVENT TIMELINE</span>
                <span className="th-sub mono">RECENT SENSOR & AI TRIGGERS</span>
              </div>
              <button 
                className="view-all-events-btn mono"
                onClick={() => onNavigate('events')}
              >
                VIEW ALL
              </button>
            </div>

            <div className="timeline-scroll-body">
              <EventTimeline 
                events={events} 
                onSelectEvent={onSelectEvent} 
                maxItems={5} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
