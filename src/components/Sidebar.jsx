import React from 'react';
import { 
  LayoutDashboard, 
  Video, 
  Activity, 
  Film, 
  Image as ImageIcon, 
  HardDrive, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live', label: 'Live Monitor', icon: Video, hasLiveBadge: true },
  { id: 'images', label: 'Captures', icon: ImageIcon },
  { id: 'footage', label: 'Recordings', icon: Film },
  { id: 'events', label: 'Events', icon: Activity },
  { id: 'device', label: 'Device', icon: HardDrive },
];

export default function Sidebar({ 
  activeTab, 
  onSelectTab, 
  isCollapsed, 
  onToggleCollapse, 
  deviceStatus,
  backendOnline
}) {
  const isDeviceOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const isCameraOnline = deviceStatus?.camera_status === 'ONLINE';

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

      {/* Heartbeat Status Indicator (Strictly Real State) */}
      <div className="sidebar-heartbeat">
        <div className="heartbeat-indicator">
          <span className={`heartbeat-pulse ${isDeviceOnline ? 'online' : 'offline'}`} />
          <span className={`heartbeat-dot ${isDeviceOnline ? 'online' : 'offline'}`} />
        </div>
        {!isCollapsed && (
          <div className="heartbeat-meta">
            <span className="heartbeat-label">EDGE NODE</span>
            <span className="heartbeat-val mono">
              {!backendOnline 
                ? 'BACKEND OFFLINE' 
                : isDeviceOnline 
                  ? 'ONLINE' 
                  : 'OFFLINE'}
            </span>
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
                <Icon size={18} />
              </span>
              {!isCollapsed && (
                <>
                  <span className="nav-label">{item.label}</span>
                  {item.hasLiveBadge && (
                    <span className={`nav-badge ${isCameraOnline ? 'badge-live' : 'badge-offline'}`}>
                      {isCameraOnline ? 'LIVE' : 'OFFLINE'}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Collapse Toggle */}
      <div className="sidebar-footer">
        <button
          className="collapse-toggle-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!isCollapsed && <span className="collapse-text mono">COLLAPSE</span>}
        </button>
      </div>
    </aside>
  );
}
