import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { fetchAiStatus } from '../services/api';
import './AIScreen.css';

export default function AIScreen() {
  const [aiInfo, setAiInfo] = useState(null);

  useEffect(() => {
    fetchAiStatus().then(setAiInfo);
  }, []);

  return (
    <div className="ai-screen-container">
      <div className="ai-status-strip glass-panel">
        <div className="ai-strip-col">
          <span className="strip-kicker mono">AUTHENTIC EDGE AI STATUS</span>
          <div className="strip-title-row">
            <span className="strip-title">YOLOv8 & ADAPTIVE CLAHE PIPELINE</span>
            <StatusBadge status={aiInfo?.status || 'ONLINE'} />
          </div>
          <span className="strip-sub mono">
            {aiInfo?.enhancement_pipeline || 'Adaptive CLAHE + Detail Sharpening'}
          </span>
        </div>
      </div>
    </div>
  );
}
