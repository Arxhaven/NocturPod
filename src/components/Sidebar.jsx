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
  setActiveTab,
  isCollapsed, 
  collapsed,
  onToggleCollapse, 
  setCollapsed,
  deviceStatus,
  backendOnline
}) {
  const selectTab = onSelectTab || setActiveTab;
  const isCollapsedState = Boolean(isCollapsed ?? collapsed);
  const toggleCollapse = onToggleCollapse || (setCollapsed ? () => setCollapsed(!isCollapsedState) : undefined);

  const isDeviceOnline = deviceStatus?.status === 'ONLINE' || deviceStatus?.status === 'RECORDING';
  const isCameraOnline = deviceStatus?.camera_status === 'ONLINE';

  return (
    <aside className={`sidebar-container ${isCollapsedState ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-mark">
          <div className="lens-ring" />
          <div className="lens-core" />
        </div>
        {!isCollapsedState && (
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
        {!isCollapsedState && (
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
              type="button"
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => selectTab && selectTab(item.id)}
              title={isCollapsedState ? item.label : undefined}
            >
              <span className="nav-icon-wrap">
                <Icon size={18} />
              </span>
              {!isCollapsedState && (
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
      {toggleCollapse && (
        <div className="sidebar-footer">
          <button
            type="button"
            className="collapse-toggle-btn"
            onClick={toggleCollapse}
            title={isCollapsedState ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label={isCollapsedState ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsedState ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!isCollapsedState && <span className="collapse-text mono">COLLAPSE</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
