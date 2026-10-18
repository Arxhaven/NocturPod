import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { fetchAiStatus, runEnhancementDiagnostics } from '../services/api';
import './AIScreen.css';

export default function AIScreen() {
  const [aiInfo, setAiInfo] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState('');

  const handleEnhancementDiagnostic = async () => {
    setDiagnosticLoading(true);
    setDiagnosticError('');
    try {
      const result = await runEnhancementDiagnostics();
      setDiagnostic(result);
      const latest = await fetchAiStatus();
      if (latest) setAiInfo(latest);
    } catch (error) {
      setDiagnosticError(error?.message || 'Unable to run enhancement diagnostics.');
    } finally {
      setDiagnosticLoading(false);
    }
  };

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

          <div className="ai-enhancement-diagnostic">
            <div className="ai-enhancement-diagnostic-header">
              <div>
                <span className="met-label mono">REAL-ESRGAN SELF-TEST</span>
                <strong>Check the live enhancement model</strong>
                <p>Loads the configured ONNX model and runs a tiny test inference. Saved captures are not modified.</p>
              </div>
              <button
                type="button"
                className="ai-diagnostic-button"
                onClick={handleEnhancementDiagnostic}
                disabled={diagnosticLoading}
              >
                {diagnosticLoading ? 'TESTING MODEL…' : 'RUN MODEL TEST'}
              </button>
            </div>
            {diagnosticError && (
              <div className="ai-diagnostic-error" role="alert">{diagnosticError}</div>
            )}
            {diagnostic && (
              <div className="ai-diagnostic-results" aria-live="polite">
                <div className="ai-diagnostic-result-line">
                  <span>Model inference</span>
                  <strong className={diagnostic.super_resolution?.status === 'READY' ? 'ready' : 'failed'}>
                    {diagnostic.super_resolution?.status || 'UNKNOWN'}
                  </strong>
                </div>
                <div className="ai-diagnostic-result-line">
                  <span>Model file</span>
                  <strong>{diagnostic.super_resolution?.model_file || '—'} · {diagnostic.super_resolution?.model_file_present ? 'present' : 'missing'}</strong>
                </div>
                <div className="ai-diagnostic-result-line">
                  <span>Inference probe</span>
                  <strong>{diagnostic.super_resolution?.inference_probe || '—'}</strong>
                </div>
                <div className="ai-diagnostic-result-line">
                  <span>Duration</span>
                  <strong>{diagnostic.super_resolution?.duration_ms != null ? `${diagnostic.super_resolution.duration_ms} ms` : '—'}</strong>
                </div>
                {diagnostic.super_resolution?.error && (
                  <pre className="ai-diagnostic-error mono">{diagnostic.super_resolution.error}</pre>
                )}
                <div className="ai-diagnostic-result-line">
                  <span>Supabase configured</span>
                  <strong>{diagnostic.storage?.supabase_configured ? 'Yes' : 'No'}</strong>
                </div>
                <div className="ai-diagnostic-result-line">
                  <span>Media directory writable</span>
                  <strong>{diagnostic.storage?.media_directory_writable ? 'Yes' : 'No'}</strong>
                </div>
                <div className="ai-diagnostic-issues-title">Recent enhancement issues</div>
                {Array.isArray(diagnostic.recent_enhancement_issues) && diagnostic.recent_enhancement_issues.length > 0 ? (
                  <div className="ai-diagnostic-issues">
                    {diagnostic.recent_enhancement_issues.map((issue) => (
                      <div className="ai-diagnostic-issue" key={issue.event_id || issue.timestamp}>
                        <div className="ai-diagnostic-issue-heading">
                          <strong>{issue.event_id || 'Unknown capture'}</strong>
                          <span>{issue.ai_status || issue.status}</span>
                        </div>
                        <p>{issue.error || `Status: ${issue.status}; AI status: ${issue.ai_status}. No stored error message was available.`}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ai-detector-note">No failed or stuck enhancement events were found in the recent event scan.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
