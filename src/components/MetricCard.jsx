import React from 'react';
import './MetricCard.css';

export default function MetricCard({ label, value, subtext, icon: Icon, trend }) {
  return (
    <div className="metric-card glass-panel">
      <div className="metric-header">
        <span className="metric-label mono">{label}</span>
        {Icon && (
          <div className="metric-icon-wrap">
            <Icon size={14} />
          </div>
        )}
      </div>

      <div className="metric-body">
        <span className="metric-value mono">{value}</span>
        {subtext && <span className="metric-subtext">{subtext}</span>}
      </div>

      {trend && (
        <div className="metric-trend">
          <span className="trend-badge mono">{trend}</span>
        </div>
      )}
    </div>
  );
}
