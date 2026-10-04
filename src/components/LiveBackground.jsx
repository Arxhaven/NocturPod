import React from 'react';
import './LiveBackground.css';

export default function LiveBackground() {
  return (
    <div className="animated-bg" aria-hidden="true">
      <div className="animated-bg-orb orb-1" />
      <div className="animated-bg-orb orb-2" />
      <div className="animated-bg-orb orb-3" />
      <div className="animated-bg-grid" />
      <div className="scan-beam" />
    </div>
  );
}
