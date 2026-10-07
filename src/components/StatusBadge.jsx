import React from 'react';
import './StatusBadge.css';

export default function StatusBadge({ status = 'OFFLINE', size = 'normal', pulse }) {
  const normalized = (status || 'OFFLINE').toUpperCase();

  const getStatusClass = () => {
    switch (normalized) {
      case 'ONLINE':
        return 'status-online';
      case 'RECORDING':
      case 'CAPTURING':
        return 'status-recording';
      case 'PROCESSING':
      case 'PENDING':
      case 'CONNECTING':
      case 'QUEUED':
        return 'status-processing';
      case 'WARNING':
      case 'WAITING':
      case 'WAITING_FOR_CAMERA':
        return 'status-warning';
      case 'OFFLINE':
      case 'ERROR':
      case 'FAILED':
      case 'DISCONNECTED':
        return 'status-error';
      default:
        return 'status-neutral';
    }
  };

  // Only pulse if actively running/streaming/recording
  const shouldPulse = pulse !== undefined 
    ? pulse 
    : (normalized === 'ONLINE' || normalized === 'RECORDING' || normalized === 'PROCESSING');

  return (
    <span className={`status-badge ${getStatusClass()} size-${size}`}>
      {shouldPulse && <span className="status-dot-pulse" />}
      <span className="status-dot" />
      <span className="status-text">{normalized.replace(/_/g, ' ')}</span>
    </span>
  );
}
