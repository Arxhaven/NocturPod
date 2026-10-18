import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { fetchAiStatus } from '../services/api';
import './AIScreen.css';

export default function AIScreen() {
  const [aiInfo, setAiInfo] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchAiStatus()
      .then((result) => { if (mounted) setAiInfo(result); })
      .catch(() => { if (mounted) setAiInfo({ status: 'OFFLINE' }); });
    return () => { mounted = false; };
  }, []);

  const detector = aiInfo?.object_detection;
  const detectorReady = Boolean(detector?.available);
  const classScope = Array.isArray(detector?.class_scope)
    ? `${detector.class_scope.length} configured classes`
    : (detector?.class_scope || 'All COCO classes');

  return (
    <div className="ai-screen-container">
      <div className="ai-status-strip glass-panel">
        <div className="ai-strip-col">
          <span className="strip-kicker mono">AUTHENTIC EDGE AI STATUS</span>
          <div className="strip-title-row">
            <span className="strip-title">REAL-ESRGAN 4K SUPER-RESOLUTION + YOLOv8</span>
            <StatusBadge status={!aiInfo ? 'CHECKING' : (detectorReady ? 'ONLINE' : 'OFFLINE')} />
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
              SUPER-RESOLUTION ERROR: {aiInfo.super_resolution.error}
            </div>
          )}
          <div className={`ai-detector-health ${detectorReady ? 'ready' : 'unavailable'}`}>
            <div className="ai-detector-health-top">
              <div>
                <span className="met-label mono">OBJECT DETECTION</span>
                <strong>{!aiInfo ? 'Checking detector…' : (detectorReady ? 'Model loaded' : 'Model unavailable')}</strong>
              </div>
              <span className={`ai-detector-state mono ${detectorReady ? 'ready' : 'unavailable'}`}>
                {detectorReady ? 'READY' : (!aiInfo ? 'CHECKING' : 'UNAVAILABLE')}
              </span>
            </div>
            <div className="ai-detector-facts">
              <span><b>Model</b> {detector?.model || 'YOLOv8n'}</span>
              <span><b>Coverage</b> {classScope}</span>
              {detector?.last_inference_status && (
                <span><b>Last inference</b> {detector.last_inference_status}
                  {detector.last_inference_count != null ? ` · ${detector.last_inference_count} object(s)` : ''}
                  {detector.last_inference_ms != null ? ` · ${detector.last_inference_ms} ms` : ''}
                </span>
              )}
            </div>
            {detector?.error && <p className="ai-detector-error mono">{detector.error}</p>}
            <p className="ai-detector-note">
              {detector?.note || 'If a scene is very dark, blurred, distant, or occluded, the detector may miss a subject. Confidence is not verified accuracy.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
