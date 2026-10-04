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
  Sliders
} from 'lucide-react';
import { detectObjects } from '../services/api';
import './AIScreen.css';

export default function AIScreen({ aiSummary }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isInferencing, setIsInferencing] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [apiError, setApiError] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsInferencing(true);
    setApiError(null);
    setInferenceResult(null);

    try {
      // Call existing Python API server /detect endpoint
      const result = await detectObjects(file);
      setInferenceResult(result);
    } catch (err) {
      console.warn("Backend not running or failed, simulating edge inference output:", err);
      // Clean fallback showing how the backend structure is represented
      setTimeout(() => {
        setInferenceResult({
          objects: [
            { label: "person", confidence: 0.9382, box: [120, 60, 410, 520] },
            { label: "bicycle", confidence: 0.8715, box: [340, 220, 510, 480] }
          ],
          count: 2,
          simulated: true
        });
        setIsInferencing(false);
      }, 700);
      return;
    }
    setIsInferencing(false);
  };

  return (
    <div className="ai-screen-container">
      {/* Top AI Status strip */}
      <div className="ai-status-strip glass-panel">
        <div className="ai-strip-col">
          <div className="ai-strip-head">
            <span className="strip-title">YOLOV8N LOW-LIGHT VISION PIPELINE</span>
            <StatusBadge status="READY" size="small" />
          </div>
          <span className="strip-meta mono">
            NCNN QUANTIZED INT8 • ADAPTIVE CLAHE LUM ENHANCE • ASYNC SQLITE EVIDENCE LOGGING
          </span>
        </div>

        <div className="ai-metrics-row">
          <div className="ai-met-item">
            <span className="met-label mono">PROCESSING STATUS</span>
            <span className="met-val mono active">{aiSummary?.processingStatus ?? 'COMPLETE'}</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">INFERENCE LATENCY</span>
            <span className="met-val mono">{aiSummary?.latencyMs ?? 38} ms</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">ANALYZED TODAY</span>
            <span className="met-val mono">{aiSummary?.totalAnalyzedToday ?? 73} FRAMES</span>
          </div>
          <div className="ai-met-item">
            <span className="met-label mono">CLAHE ADAPTIVE CLIP</span>
            <span className="met-val mono">{aiSummary?.claheClipLimit ?? '1.8 - 2.5'}</span>
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
            Test custom drone or night surveillance images directly against the YOLOv8n detector with adaptive CLAHE preprocessing.
          </p>

          <label className="upload-dropzone">
            <Upload size={24} className="upload-icon" />
            <span className="upload-text">DRAG & DROP IMAGE OR CLICK TO BROWSE</span>
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

          {inferenceResult && (
            <div className="inference-result-box">
              <div className="res-header">
                <span className="res-title mono">INFERENCE RESULT</span>
                <span className="res-count mono">{inferenceResult.count} OBJECT(S) FOUND</span>
              </div>

              {inferenceResult.simulated && (
                <div className="simulated-pill mono">
                  NOTE: PYTHON SERVER ON :5000 NOT DETECTED — SIMULATING REAL YOLOV8 OUTPUT SCHEMA
                </div>
              )}

              <div className="detected-objects-list">
                {inferenceResult.objects?.map((obj, i) => (
                  <div key={i} className="detected-obj-item">
                    <div className="obj-main mono">
                      <span className="obj-label">{obj.label.toUpperCase()}</span>
                      <span className="obj-conf">{(obj.confidence * 100).toFixed(2)}%</span>
                    </div>
                    <div className="obj-box mono">
                      BOUNDING BOX: [{obj.box.join(', ')}]
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
