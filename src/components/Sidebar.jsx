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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatHeartbeat } from '../utils/deviceStatus';
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

export default function Sidebar({ 
  activeTab, 
  onSelectTab, 
  setActiveTab,
  isCollapsed, 
  collapsed,
  onToggleCollapse, 
  setCollapsed,
  deviceStatus, 
  isDemoMode = false,
  eventCount
}) {
  const isOnline = deviceStatus?.status === 'ONLINE';
  const heartbeatText = formatHeartbeat(deviceStatus?.status, deviceStatus?.lastHeartbeatSec);
  const isHeartbeatActive = isOnline && deviceStatus?.lastHeartbeatSec != null;
  const selectTab = onSelectTab || setActiveTab;
  const collapsedState = Boolean(isCollapsed ?? collapsed);
  const toggleCollapse = onToggleCollapse || (setCollapsed ? () => setCollapsed(!collapsedState) : undefined);

  return (
    <aside className={`sidebar-container ${collapsedState ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-mark">
          <div className="lens-ring" />
          <div className="lens-core" />
        </div>
        {!collapsedState && (
          <div className="brand-text">
            <span className="brand-name">NOCTUR<span className="brand-highlight">POD</span></span>
            <span className="brand-sub">EDGE SURVEILLANCE</span>
          </div>
        )}
      </div>

      {/* Heartbeat Status Indicator */}
      <div className="sidebar-heartbeat">
        <div className="heartbeat-indicator">
          {isHeartbeatActive && <span className="heartbeat-pulse" />}
          <span className={`heartbeat-dot ${isHeartbeatActive ? '' : 'inactive'}`} />
        </div>
        {!collapsedState && (
          <div className="heartbeat-meta">
            <span className="heartbeat-label">EDGE HEARTBEAT</span>
            <span className="heartbeat-val mono">{heartbeatText}</span>
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
              type="button"
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => selectTab && selectTab(item.id)}
              title={collapsedState ? item.label : undefined}
            >
              <span className="nav-icon-wrap">
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.7} />
              </span>
              {!collapsedState && <span className="nav-label">{item.label}</span>}
              {!collapsedState && item.badge && (
                <span className="nav-badge mono">{item.badge}</span>
              )}
              {isActive && <div className="active-indicator" />}
            </button>
          );
        })}
      </nav>

      {/* Edge System Summary in footer */}
      {!collapsedState && (
        <div className="sidebar-footer">
          <div className="edge-chip mono">
            <div className="chip-row">
              <span className="chip-label">NODE:</span>
              <span className="chip-val">{isOnline ? 'RPI4-OV5647' : 'OFFLINE'}</span>
            </div>
            <div className="chip-row">
              <span className="chip-label">MODE:</span>
              <span className="chip-val" style={{ color: isDemoMode ? '#faad14' : (isOnline ? 'var(--status-online)' : 'var(--status-error)') }}>
                {isDemoMode ? 'DEMO' : (isOnline ? 'LIVE' : 'OFFLINE')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button */}
      {toggleCollapse && (
        <button 
          type="button"
          className="collapse-toggle-btn"
          onClick={toggleCollapse}
          aria-label={collapsedState ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsedState ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      )}
    </aside>
  );
}
