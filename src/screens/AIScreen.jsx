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
            <span className="strip-title">REAL-ESRGAN 4K SUPER-RESOLUTION + YOLOv8</span>
            <StatusBadge status={aiInfo?.status || 'ONLINE'} />
          </div>
          <span className="strip-sub mono">
            {aiInfo?.enhancement_pipeline || 'Real-ESRGAN x4 learned restoration with 4K-target output'}
          </span>
          <div className="ai-metrics-row">
            <div className="ai-met-item">
              <span className="met-label mono">SUPER-RESOLUTION MODEL</span>
              <span className={'met-val mono ' + (aiInfo?.super_resolution?.state === 'READY' ? 'active' : '')}>
                {aiInfo?.super_resolution?.state || 'CHECKING'}
              </span>
            </div>
            <div className="ai-met-item">
              <span className="met-label mono">OUTPUT TARGET</span>
              <span className="met-val mono">
                {aiInfo?.super_resolution?.target_long_edge
                  ? aiInfo.super_resolution.target_long_edge + ' PX LONG EDGE'
                  : '3840 PX LONG EDGE'}
              </span>
            </div>
            <div className="ai-met-item">
              <span className="met-label mono">RUNTIME</span>
              <span className="met-val mono">{aiInfo?.super_resolution?.runtime || 'ONNX Runtime CPU'}</span>
            </div>
          </div>
          {aiInfo?.super_resolution?.error && (
            <div className="strip-sub mono">
              MODEL ERROR: {aiInfo.super_resolution.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
