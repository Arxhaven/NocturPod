import React, { useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { 
  Cpu, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  Upload, 
  FileCheck,
  TrendingUp,
  Sliders,
  RefreshCw
} from 'lucide-react';
import { detectObjects } from '../services/api';
import { runEdgeInference } from '../utils/aiInference';
import './AIScreen.css';

export default function AIScreen({ aiSummary, isDemoMode = false }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isInferencing, setIsInferencing] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [apiError, setApiError] = useState(null);

  const executeInference = async (file) => {
    if (!file) return;
    setIsInferencing(true);
    setApiError(null);
    setInferenceResult(null);

    try {
      const result = await runEdgeInference(file, detectObjects);
      setInferenceResult(result);
    } catch (err) {
      setApiError(err?.message || 'Edge detection request failed. Ensure API server is running on :5000.');
    } finally {
      setIsInferencing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    executeInference(file);
  };

  const handleRetry = () => {
    if (selectedFile) {
      executeInference(selectedFile);
    }
  };

  return (
    <div className="ai-screen-container">
      {/* Top AI Status strip */}
      <div className="ai-status-strip glass-panel">
        <div className="ai-strip-col">
          <div className="ai-strip-head">
            <span className="strip-title">YOLOV8N LOW-LIGHT VISION PIPELINE</span>
            <StatusBadge status={isDemoMode ? "READY" : (aiSummary?.processingStatus ?? "READY")} size="small" />
            {isDemoMode && (
              <span className="mono demo-badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(250, 173, 20, 0.2)', border: '1px solid #faad14', borderRadius: '4px', color: '#faad14' }}>
                DEMO SUMMARY
              </span>
            )}
          </div>
          <span className="strip-meta mono">
            NCNN QUANTIZED INT8 • ADAPTIVE CLAHE LUM ENHANCE • ASYNC SQLITE EVIDENCE LOGGING
          </span>
        </div>

        <div className="ai-metrics-row">
          <div className="ai-met-item">
            <span className="met-label mono">PROCESSING STATUS</span>
            <span className="met-val mono active">{aiSummary?.processingStatus ?? 'READY'}</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">INFERENCE LATENCY</span>
            <span className="met-val mono">{aiSummary?.latencyMs != null ? `${aiSummary.latencyMs} ms` : 'N/A'}</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">ANALYZED TODAY</span>
            <span className="met-val mono">{aiSummary?.totalAnalyzedToday != null ? `${aiSummary.totalAnalyzedToday} FRAMES` : '0 FRAMES'}</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">CLAHE ADAPTIVE CLIP</span>
            <span className="met-val mono">{aiSummary?.claheClipLimit ?? '2.2 (Default)'}</span>
          </div>
        </div>
      </div>

      <div className="ai-main-grid">
        {/* Left Column: Model Class Confidence Breakdown */}
        <div className="ai-classes-panel glass-panel">
          <div className="panel-top-row">
            <span className="p-title">TRACKED OBJECT CLASSIFICATIONS</span>
            <span className="p-sub mono">DATASET: CUSTOM AERIAL & PERIMETER</span>
          </div>

          <div className="classes-list">
            {aiSummary?.classesTracked?.map((item, index) => (
              <div key={index} className="class-card">
                <div className="class-header">
                  <span className="class-label">{item.label}</span>
                  <span className="class-conf mono">{item.avgConfidence}% AVG CONF</span>
                </div>

                <div className="confidence-track">
                  <div 
                    className="confidence-fill" 
                    style={{ width: `${item.avgConfidence}%` }} 
                  />
                </div>

                <div className="class-footer mono">
                  <span>TODAY: {item.countToday} DETECTIONS</span>
                  <span className="class-status-badge">{item.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pipeline execution order */}
          <div className="pipeline-flow-box">
            <span className="flow-title mono">PIPELINE EXECUTION STAGES</span>
            <div className="flow-steps">
              {aiSummary?.pipelineStages?.map((stage, idx) => (
                <div key={idx} className="flow-step-item">
                  <div className="step-num mono">{idx + 1}</div>
                  <div className="step-info">
                    <span className="step-name">{stage.step}</span>
                    <span className="step-latency mono">{stage.timeUs}</span>
                  </div>
                  <span className="step-status mono">{stage.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Direct Live Inference Testing Tool */}
        <div className="ai-test-panel glass-panel">
          <div className="panel-top-row">
            <div className="p-title-wrap">
              <span className="p-title">EDGE INFERENCE TEST BENCH</span>
              <span className="p-sub mono">CONNECTS TO LOCAL PYTHON API (/detect)</span>
            </div>
            <StatusBadge status={isInferencing ? "PROCESSING" : "READY"} size="small" />
          </div>

          <p className="test-desc">
            Test custom drone or night surveillance images directly against the edge YOLOv8n detector with adaptive CLAHE preprocessing.
          </p>

          <label className="upload-dropzone">
            <Upload size={24} className="upload-icon" />
            <span className="upload-text">
              {selectedFile ? `SELECTED: ${selectedFile.name}` : 'DRAG & DROP IMAGE OR CLICK TO BROWSE'}
            </span>
            <span className="upload-sub mono">Supports JPG, PNG (RGB or Greyscale IR)</span>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileUpload}
              className="hidden-file-input"
            />
          </label>

          {isInferencing && (
            <div className="inferencing-indicator mono">
              <span className="spinner-dot" />
              <span>RUNNING CLAHE PREPROCESSING & YOLOv8 INFERENCE...</span>
            </div>
          )}

          {apiError && (
            <div 
              className="api-error-banner mono" 
              style={{ 
                color: '#ff7875', 
                padding: '12px 14px', 
                background: 'rgba(255, 77, 79, 0.12)', 
                border: '1px solid rgba(255, 77, 79, 0.3)', 
                borderRadius: '6px', 
                margin: '14px 0', 
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}
            >
              <span>⚠ INFERENCE ERROR: {apiError}</span>
              <button 
                type="button" 
                onClick={handleRetry}
                className="mono"
                style={{
                  background: 'rgba(255, 77, 79, 0.25)',
                  border: '1px solid #ff7875',
                  color: '#fff',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px'
                }}
              >
                <RefreshCw size={11} />
                <span>RETRY</span>
              </button>
            </div>
          )}

          {inferenceResult && (
            <div className="inference-result-box">
              <div className="res-header">
                <span className="res-title mono">INFERENCE RESULT</span>
                <span className="res-count mono">{inferenceResult.count} OBJECT(S) FOUND</span>
              </div>

              {inferenceResult.count === 0 ? (
                <div className="no-detections mono" style={{ padding: '16px', color: 'var(--color-muted-sage)', fontSize: '13px' }}>
                  No target classifications matched confidence threshold (&gt; 0.30).
                </div>
              ) : (
                <div className="detected-objects-list">
                  {inferenceResult.objects?.map((obj, i) => (
                    <div key={i} className="detected-obj-item">
                      <div className="obj-main mono">
                        <span className="obj-label">{obj.label.toUpperCase()}</span>
                        <span className="obj-conf">{(obj.confidence * 100).toFixed(2)}%</span>
                      </div>
                      <div className="obj-box mono">
                        BOUNDING BOX: [{Array.isArray(obj.box) ? obj.box.join(', ') : 'N/A'}]
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
