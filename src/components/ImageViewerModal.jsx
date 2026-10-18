import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  Download, 
  Sparkles, 
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { resolveMediaUrl, detectEventObjects } from '../services/api';
import './ImageViewerModal.css';

function parseImageResolution(value) {
  const match = String(value || '').match(/(\d{2,5})\s*x\s*(\d{2,5})/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export default function ImageViewerModal({ image, onClose, onDelete, onDetectionComplete }) {
  const [viewMode, setViewMode] = useState('ENHANCED'); // 'ENHANCED' or 'ORIGINAL'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failedUrls, setFailedUrls] = useState({});
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });
  const [showBoxes, setShowBoxes] = useState(true);
  const autoScanEventRef = useRef(null);
  const imageId = image?.event_id || image?.id;

  const runDetection = useCallback(async () => {
    if (!imageId) return;
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const result = await detectEventObjects(String(imageId));
      const localResult = {
        eventId: String(imageId),
        detection_status: result.detection_status || null,
        detections: Array.isArray(result.detections) ? result.detections : [],
      };
      setAnalysisResult(localResult);
      if (onDetectionComplete) await onDetectionComplete(result);
    } catch (error) {
      setAnalysisError(error?.message || 'Object detection could not be completed.');
    } finally {
      setAnalysisLoading(false);
    }
  }, [imageId, onDetectionComplete]);

  // Older captures may have been enhanced before object detection was wired into the
  // ingestion path. Analyze these once when their viewer opens; keep a manual rescan too.
  useEffect(() => {
    if (!imageId) return;
    const savedDetections = Array.isArray(image?.detections) ? image.detections : [];
    const savedStatus = image?.detection_status?.status;
    const eventKey = String(imageId);
    if (
      savedDetections.length === 0 &&
      !savedStatus &&
      autoScanEventRef.current !== eventKey
    ) {
      autoScanEventRef.current = eventKey;
      void runDetection();
    }
  }, [imageId, image?.detections?.length, image?.detection_status?.status, runDetection]);

  const rawOriginalUrl = image?.original_url || image?.url;
  const rawEnhancedUrl = image?.enhanced_url || image?.thumbnail_url || image?.thumbnail;
  const originalUrl = resolveMediaUrl(rawOriginalUrl);
  const enhancedUrl = resolveMediaUrl(rawEnhancedUrl);
  const isEnhancedReady = image?.processing_status === 'COMPLETE' && enhancedUrl;
  const isEnhancing = image?.processing_status === 'PROCESSING' || image?.processing_status === 'PENDING';
  const quality = image?.quality_metrics;
  const qualityBefore = quality?.before?.visibility_index;
  const qualityAfter = quality?.after?.visibility_index;
  const qualityChange = quality?.relative_change_pct;
  const eventKey = imageId == null ? null : String(imageId);
  const localAnalysis = analysisResult?.eventId === eventKey ? analysisResult : null;
  const detections = localAnalysis?.detections ?? (Array.isArray(image?.detections) ? image.detections : []);
  const detectionStatus = localAnalysis?.detection_status || image?.detection_status || null;
  const activeDisplayUrl = viewMode === 'ENHANCED' && isEnhancedReady ? enhancedUrl : originalUrl;

  useEffect(() => {
    setDisplayDimensions({ width: 0, height: 0 });
  }, [activeDisplayUrl]);

  const resolutionAfter = parseImageResolution(quality?.resolution_after);
  const fallbackBoxResolution = resolutionAfter || (displayDimensions.width && displayDimensions.height
    ? (displayDimensions.width >= displayDimensions.height
      ? { width: 3840, height: Math.round(3840 * displayDimensions.height / displayDimensions.width) }
      : { width: Math.round(3840 * displayDimensions.width / displayDimensions.height), height: 3840 })
    : null);

  const getNormalizedBox = (detection) => {
    const values = ['x1', 'y1', 'x2', 'y2'].map((key) => Number(detection?.[key]));
    if (values.some((value) => !Number.isFinite(value))) return null;
    if (detection?.coordinates_normalized || values.every((value) => value >= 0 && value <= 1.001)) {
      return values.map((value) => Math.max(0, Math.min(1, value)));
    }
    if (!fallbackBoxResolution?.width || !fallbackBoxResolution?.height) return null;
    return [
      values[0] / fallbackBoxResolution.width,
      values[1] / fallbackBoxResolution.height,
      values[2] / fallbackBoxResolution.width,
      values[3] / fallbackBoxResolution.height,
    ].map((value) => Math.max(0, Math.min(1, value)));
  };

  if (!image) return null;

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="viewer-header">
          <div className="viewer-title-group">
            <span className="viewer-id mono">{image.event_id || image.id}</span>
            <div className="viewer-status-indicator">
              {image.status === 'ENHANCEMENT_FAILED' ? (
                <span className="tag-original mono">
                  {enhancedUrl ? 'UPDATE FAILED · LAST VERSION KEPT' : 'ENHANCEMENT FAILED'}
                </span>
              ) : isEnhancedReady ? (
                <span className="tag-complete mono"><CheckCircle2 size={13} /> ENHANCED · 4K TARGET</span>
              ) : isEnhancing ? (
                <span className="tag-processing mono"><Clock size={13} /> ENHANCING...</span>
              ) : (
                <span className="tag-original mono">ORIGINAL ONLY</span>
              )}
            </div>
          </div>

          <div className="viewer-actions">
            {/* Toggle Between Original and Enhanced */}
            <div className="mode-toggle-group">
              <button 
                className={`mode-toggle-btn mono ${viewMode === 'ORIGINAL' ? 'active' : ''}`}
                onClick={() => setViewMode('ORIGINAL')}
              >
                <ImageIcon size={14} />
                <span>ORIGINAL</span>
              </button>
              <button 
                className={`mode-toggle-btn mono ${viewMode === 'ENHANCED' ? 'active' : ''}`}
                onClick={() => setViewMode('ENHANCED')}
                disabled={!isEnhancedReady}
                title={!isEnhancedReady ? "Enhancement not ready yet" : undefined}
              >
                <Sparkles size={14} />
                <span>AI ENHANCED</span>
              </button>
            </div>

            {/* Download Buttons */}
            {originalUrl && (
              <a 
                href={originalUrl} 
                download={`nocturpod-${image.event_id || image.id}-original.jpg`} 
                target="_blank" 
                rel="noreferrer"
                className="viewer-btn mono"
                title="Download original capture"
              >
                <Download size={14} />
                <span>ORIGINAL</span>
              </a>
            )}

            {enhancedUrl && isEnhancedReady && (
              <a 
                href={enhancedUrl} 
                download={`nocturpod-${image.event_id || image.id}-enhanced.jpg`} 
                target="_blank" 
                rel="noreferrer"
                className="viewer-btn highlight mono"
                title="Download AI enhanced capture"
              >
                <Download size={14} />
                <span>ENHANCED</span>
              </a>
            )}

            {/* Delete Button */}
            {onDelete && (
              <button
                className={`viewer-btn delete-btn mono ${confirmDelete ? 'confirm' : ''}`}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                  } else {
                    onDelete(image.event_id || image.id);
                  }
                }}
                title={confirmDelete ? "Click again to permanently delete" : "Delete capture"}
              >
                <Trash2 size={14} />
                <span>{confirmDelete ? "CONFIRM DELETE?" : "DELETE"}</span>
              </button>
            )}

            <button className="viewer-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Center Canvas / Media */}
        <div className="viewer-canvas">
          <div className="media-stage">
            {activeDisplayUrl && !failedUrls[activeDisplayUrl] ? (
              <>
              <img
                src={activeDisplayUrl}
                alt={image.event_id || 'NocturPod Capture'}
                className="viewer-media-image"
                onLoad={(event) => setDisplayDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                onError={() => setFailedUrls((previous) => ({ ...previous, [activeDisplayUrl]: true }))}
              />
              {showBoxes && displayDimensions.width > 0 && displayDimensions.height > 0 && detections.length > 0 && (
                <svg
                  className="detection-overlay"
                  viewBox={`0 0 ${displayDimensions.width} ${displayDimensions.height}`}
                  preserveAspectRatio="none"
                  aria-label="Detected object bounding boxes"
                >
                  {detections.map((detection, index) => {
                    const box = getNormalizedBox(detection);
                    if (!box) return null;
                    const [nx1, ny1, nx2, ny2] = box;
                    const x = nx1 * displayDimensions.width;
                    const y = ny1 * displayDimensions.height;
                    const width = Math.max(0, (nx2 - nx1) * displayDimensions.width);
                    const height = Math.max(0, (ny2 - ny1) * displayDimensions.height);
                    const label = `${detection.label || 'Object'} ${detection.confidence != null ? Math.round(Number(detection.confidence) * 100) + '%' : ''}`.trim();
                    const fontSize = Math.max(15, displayDimensions.width * 0.014);
                    const labelHeight = fontSize * 1.55;
                    const labelWidth = Math.min(
                      displayDimensions.width - x,
                      Math.max(fontSize * 4.8, label.length * fontSize * 0.57 + fontSize)
                    );
                    const labelY = Math.max(0, y - labelHeight);
                    return (
                      <g key={`${detection.label || 'object'}-${index}`}>
                        <rect className="detection-box" x={x} y={y} width={width} height={height} />
                        <rect className="detection-box-label-bg" x={x} y={labelY} width={labelWidth} height={labelHeight} rx={fontSize * 0.2} />
                        <text className="detection-box-label" x={x + fontSize * 0.35} y={labelY + fontSize * 1.08} fontSize={fontSize}>{label}</text>
                      </g>
                    );
                  })}
                </svg>
              )}
              </>
            ) : (
              <div className="no-media-box mono">
                <AlertCircle size={28} />
                <span>MEDIA CURRENTLY UNAVAILABLE</span>
                <span className="mono">Original file may be missing from Storage.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Metadata */}
        <div className="viewer-meta-strip">
          <div className="meta-cell">
            <span className="meta-label mono">EVENT ID</span>
            <span className="meta-val mono">{image.event_id || image.id}</span>
          </div>
          <div className="meta-cell">
            <span className="meta-label mono">ACTIVE VIEW</span>
            <span className="meta-val mono active">{viewMode}</span>
          </div>
          <div className="meta-cell">
            <span className="meta-label mono">STATUS</span>
            <span className="meta-val mono">{image.processing_status || 'COMPLETE'}</span>
          </div>
          {qualityBefore != null && qualityAfter != null && (
            <>
              <div className="meta-cell" title={quality?.explanation || 'Heuristic image-quality indicator, not AI accuracy.'}>
                <span className="meta-label mono">VISIBILITY INDEX*</span>
                <span className="meta-val mono">{qualityBefore.toFixed(1)} → {qualityAfter.toFixed(1)} / 100</span>
              </div>
              <div className="meta-cell" title="Relative change in a heuristic visibility index, not a percentage of detection accuracy.">
                <span className="meta-label mono">RELATIVE CHANGE*</span>
                <span className="meta-val mono">{qualityChange > 0 ? '+' : ''}{qualityChange?.toFixed(1)}%</span>
              </div>
            </>
          )}
          {quality?.ir_color_cast_detected && (
            <div className="meta-cell" title="The enhanced copy was normalized to grayscale because the original had a strong red/purple IR colour cast. The original is unchanged.">
              <span className="meta-label mono">NIGHT COLOUR</span>
              <span className="meta-val mono">IR CAST → GRAYSCALE</span>
            </div>
          )}
          {quality?.resolution_before && quality?.resolution_after && (
            <div className="meta-cell" title={quality?.upscaler || 'Learned super-resolution output resolution'}>
              <span className="meta-label mono">SOURCE → OUTPUT</span>
              <span className="meta-val mono">{quality.resolution_before} → {quality.resolution_after}</span>
            </div>
          )}
          {quality?.upscaler && (
            <div className="meta-cell" title={quality?.explanation || 'Learned super-resolution model'}>
              <span className="meta-label mono">RESTORATION MODEL</span>
              <span className="meta-val mono">{quality.upscaler}</span>
            </div>
          )}
        </div>
        {qualityBefore != null && (
          <div className="quality-disclaimer mono">*Heuristic exposure / contrast / detail / noise score; not a person-recognition accuracy percentage.</div>
        )}
        <div className="detection-summary">
          <div className="detection-summary-header">
            <div>
              <span className="meta-label mono">OBJECT DETECTION</span>
              <div className={`detection-status-line ${analysisLoading ? 'is-running' : (detectionStatus?.status === 'COMPLETE' ? 'is-found' : '')}`}>
                <span className="detection-status-dot" />
                <strong>
                  {analysisLoading ? 'ANALYZING IMAGE…'
                    : detectionStatus?.status === 'COMPLETE' ? `${detections.length} OBJECT${detections.length === 1 ? '' : 'S'} DETECTED`
                    : detectionStatus?.status === 'NO_DETECTIONS' ? 'NO OBJECTS FOUND'
                    : detectionStatus?.status === 'UNAVAILABLE' ? 'DETECTOR UNAVAILABLE'
                    : detectionStatus?.status === 'FAILED' || analysisError ? 'ANALYSIS FAILED'
                    : detections.length ? `${detections.length} STORED DETECTION${detections.length === 1 ? '' : 'S'}`
                    : 'NOT ANALYZED YET'}
                </strong>
              </div>
            </div>
            <div className="detection-summary-actions">
              {detections.length > 0 && (
                <button
                  type="button"
                  className={`detection-overlay-toggle ${showBoxes ? 'active' : ''}`}
                  onClick={() => setShowBoxes((value) => !value)}
                  aria-pressed={showBoxes}
                  title={showBoxes ? 'Hide boxes on image' : 'Show boxes on image'}
                >
                  {showBoxes ? 'HIDE BOXES' : 'SHOW BOXES'}
                </button>
              )}
              <button
                type="button"
                className="viewer-btn mono detection-run-btn"
                onClick={() => void runDetection()}
                disabled={analysisLoading}
              >
                {analysisLoading ? 'ANALYZING…' : (detections.length || detectionStatus ? 'ANALYZE AGAIN' : 'ANALYZE IMAGE')}
              </button>
            </div>
          </div>
          <p className="detection-explanation">
            {analysisLoading ? 'Running the YOLO detector on the enhanced capture, then checking the original if needed.'
              : analysisError || detectionStatus?.message || (detections.length
                ? 'Boxes indicate model-localized regions. Confidence is a model score, not verified recognition accuracy.'
                : 'Older captures are scanned automatically when opened. You can also run detection again at any time.')}
          </p>
          {detections.length > 0 ? (
            <div className="detection-pills">
              {detections.map((detection, index) => (
                <span className="detection-pill mono" key={(detection.label || 'object') + '-' + index}>
                  <strong>{(detection.label || 'Object').toUpperCase()}</strong>
                  {detection.confidence != null ? <span>{(Number(detection.confidence) * 100).toFixed(1)}% confidence</span> : null}
                </span>
              ))}
            </div>
          ) : !analysisLoading ? (
            <span className="detection-none">
              {detectionStatus?.status === 'NO_DETECTIONS'
                ? 'The model found no objects above threshold. Very dark, blurred, distant, or occluded subjects can still be missed.'
                : detectionStatus?.status === 'UNAVAILABLE'
                  ? 'The backend could not load the detection model. Check the AI status and backend logs.'
                  : 'No stored boxes are available for this image yet.'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
