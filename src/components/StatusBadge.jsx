import React from 'react';
import './StatusBadge.css';

export default function StatusBadge({ status = 'ONLINE', size = 'normal', pulse = true }) {
  const normalized = status.toUpperCase();

  const getStatusClass = () => {
    switch (normalized) {
      case 'ONLINE':
      case 'READY':
        return 'status-online';
      case 'ARMED':
        return 'status-armed';
      case 'RECORDING':
      case 'CAPTURING':
        return 'status-recording';
      case 'PROCESSING':
      case 'QUEUED':
        return 'status-processing';
      case 'WARNING':
      case 'STORED_FOR_INSPECTION':
        return 'status-warning';
      case 'OFFLINE':
      case 'ERROR':
      case 'FAILED':
        return 'status-error';
      default:
        return 'status-online';
    }
  };

  return (
    <span className={`status-badge ${getStatusClass()} size-${size}`}>
      {pulse && <span className="status-dot-pulse" />}
      <span className="status-dot" />
      <span className="status-text">{normalized.replace(/_/g, ' ')}</span>
    </span>
  );
}
