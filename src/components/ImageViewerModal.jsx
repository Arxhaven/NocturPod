import React, { useState } from 'react';
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
import { resolveMediaUrl } from '../services/api';
import './ImageViewerModal.css';

export default function ImageViewerModal({ image, onClose, onDelete }) {
  const [viewMode, setViewMode] = useState('ENHANCED'); // 'ENHANCED' or 'ORIGINAL'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failedUrls, setFailedUrls] = useState({});

  if (!image) return null;

  const rawOriginalUrl = image.original_url || image.url;
  const rawEnhancedUrl = image.enhanced_url || image.thumbnail_url || image.thumbnail;
  const originalUrl = resolveMediaUrl(rawOriginalUrl);
  const enhancedUrl = resolveMediaUrl(rawEnhancedUrl);
  const isEnhancedReady = image.processing_status === 'COMPLETE' && enhancedUrl;
  const isEnhancing = image.processing_status === 'PROCESSING' || image.processing_status === 'PENDING';
  const quality = image.quality_metrics;
  const qualityBefore = quality?.before?.visibility_index;
  const qualityAfter = quality?.after?.visibility_index;
  const qualityChange = quality?.relative_change_pct;
  const detections = Array.isArray(image.detections) ? image.detections : [];

  const activeDisplayUrl = viewMode === 'ENHANCED' && isEnhancedReady ? enhancedUrl : originalUrl;

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="viewer-header">
          <div className="viewer-title-group">
            <span className="viewer-id mono">{image.event_id || image.id}</span>
            <div className="viewer-status-indicator">
              {isEnhancedReady ? (
                <span className="tag-complete mono"><CheckCircle2 size={13} /> ENHANCED</span>
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
              <img
                src={activeDisplayUrl}
                alt={image.event_id || 'NocturPod Capture'}
                className="viewer-media-image"
                onError={() => setFailedUrls((previous) => ({ ...previous, [activeDisplayUrl]: true }))}
              />
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
          <span className="meta-label mono">STORED OBJECT DETECTIONS</span>
          <div className="detection-pills">
            {detections.length > 0 ? detections.map((detection, index) => (
              <span className="detection-pill mono" key={(detection.label || 'object') + '-' + index}>
                {(detection.label || 'Object').toUpperCase()} {detection.confidence != null ? (Number(detection.confidence) * 100).toFixed(1) + '%' : ''}
              </span>
            )) : (
              <span className="detection-none mono">No stored detections for this frame. This does not prove the scene is empty.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
