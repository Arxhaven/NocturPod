import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Sparkles, 
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import './ImageViewerModal.css';

export default function ImageViewerModal({ image, onClose }) {
  const [viewMode, setViewMode] = useState('ENHANCED'); // 'ENHANCED' or 'ORIGINAL'

  if (!image) return null;

  const originalUrl = image.original_url || image.url;
  const enhancedUrl = image.enhanced_url || image.thumbnail_url || image.thumbnail;
  const isEnhancedReady = image.processing_status === 'COMPLETE' && enhancedUrl;
  const isEnhancing = image.processing_status === 'PROCESSING' || image.processing_status === 'PENDING';

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

            <button className="viewer-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Center Canvas / Media */}
        <div className="viewer-canvas">
          <div className="media-stage">
            {activeDisplayUrl ? (
              <img 
                src={activeDisplayUrl} 
                alt={image.event_id || 'NocturPod Capture'} 
                className="viewer-media-image"
              />
            ) : (
              <div className="no-media-box mono">
                <AlertCircle size={28} />
                <span>MEDIA CURRENTLY UNAVAILABLE</span>
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
        </div>
      </div>
    </div>
  );
}
