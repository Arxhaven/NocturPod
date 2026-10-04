import React from 'react';
import { 
  LayoutDashboard, 
  Video, 
  Activity, 
  Film, 
  Image as ImageIcon, 
  Cpu, 
  HardDrive, 
  Settings as SettingsIcon,
  Radio,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live', label: 'Live Monitor', icon: Video, badge: 'LIVE' },
  { id: 'events', label: 'Events', icon: Activity },
  { id: 'footage', label: 'Footage', icon: Film },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'ai', label: 'AI Analysis', icon: Cpu },
  { id: 'device', label: 'Device', icon: HardDrive },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function Sidebar({ activeTab, onSelectTab, isCollapsed, onToggleCollapse, deviceStatus }) {
  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-mark">
          <div className="lens-ring" />
          <div className="lens-core" />
        </div>
        {!isCollapsed && (
          <div className="brand-text">
            <span className="brand-name">NOCTUR<span className="brand-highlight">POD</span></span>
            <span className="brand-sub">EDGE SURVEILLANCE</span>
          </div>
        )}
      </div>

      {/* Heartbeat Status Indicator */}
      <div className="sidebar-heartbeat">
        <div className="heartbeat-indicator">
          <span className="heartbeat-pulse" />
          <span className="heartbeat-dot" />
        </div>
        {!isCollapsed && (
          <div className="heartbeat-meta">
            <span className="heartbeat-label">EDGE HEARTBEAT</span>
            <span className="heartbeat-val mono">{deviceStatus?.lastHeartbeatSec ?? 2}s ago</span>
          </div>
        )}
      </div>

      {/* Main Navigation List */}
      <nav className="sidebar-nav" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="nav-icon-wrap">
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.7} />
              </span>
              {!isCollapsed && <span className="nav-label">{item.label}</span>}
              {!isCollapsed && item.badge && (
                <span className="nav-badge mono">{item.badge}</span>
              )}
              {isActive && <div className="active-indicator" />}
            </button>
          );
        })}
      </nav>

      {/* Edge System Summary in footer */}
      {!isCollapsed && (
        <div className="sidebar-footer">
          <div className="edge-chip mono">
            <div className="chip-row">
              <span className="chip-label">NODE:</span>
              <span className="chip-val">RPI4-OV5647</span>
            </div>
            <div className="chip-row">
              <span className="chip-label">AI:</span>
              <span className="chip-val">YOLOv8n / NCNN</span>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button 
        className="collapse-toggle-btn"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
