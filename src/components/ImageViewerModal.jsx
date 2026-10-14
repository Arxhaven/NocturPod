import React, { useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Sparkles, 
  Crosshair,
  ImageOff
} from 'lucide-react';
import './ImageViewerModal.css';

export default function ImageViewerModal({ image, onClose, onPrev, onNext }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [viewEnhanced, setViewEnhanced] = useState(Boolean(image?.enhancedUrl));
  const [loadError, setLoadError] = useState(false);

  if (!image) return null;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.3, 2.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.3, 0.7));

  // Determine current active display image URL
  const activeUrl = viewEnhanced && image.enhancedUrl ? image.enhancedUrl : (image.originalUrl || image.url);

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="viewer-header">
          <div className="viewer-title-group">
            <span className="viewer-id mono">{image.eventId || image.id}</span>
            <h2 className="viewer-title">{image.title || 'Camera Snapshot'}</h2>
          </div>

          <div className="viewer-actions">
            {image.boundingBoxes && image.boundingBoxes.length > 0 && (
              <button 
                type="button"
                className={`viewer-btn ${showBoxes ? 'active' : ''}`}
                onClick={() => setShowBoxes(!showBoxes)}
                title="Toggle AI Detection Bounding Boxes"
              >
                <Crosshair size={14} />
                <span className="mono">BOUNDING BOXES</span>
              </button>
            )}

            {image.enhancedUrl ? (
              <button 
                type="button"
                className={`viewer-btn ${viewEnhanced ? 'active' : ''}`}
                onClick={() => setViewEnhanced(!viewEnhanced)}
                title="Toggle Enhanced vs Original Capture"
              >
                <Sparkles size={14} />
                <span className="mono">{viewEnhanced ? 'VIEWING ENHANCED' : 'VIEW ORIGINAL'}</span>
              </button>
            ) : (
              <span 
                className="mono" 
                style={{
                  fontSize: '10px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: 'rgba(250, 173, 20, 0.15)',
                  border: '1px solid #faad14',
                  color: '#faad14'
                }}
                title="Adaptive low-light enhancement is being processed by the backend"
              >
                AI ENHANCEMENT: {image.aiStatus || 'PENDING'}
              </span>
            )}

            <div className="viewer-btn-group">
              <button type="button" className="viewer-btn icon" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut size={15} />
              </button>
              <span className="zoom-indicator mono">{(zoomLevel * 100).toFixed(0)}%</span>
              <button type="button" className="viewer-btn icon" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn size={15} />
              </button>
            </div>

            {activeUrl && (
              <a 
                href={activeUrl} 
                download={`nocturpod-${image.eventId || image.id}.jpg`} 
                target="_blank" 
                rel="noreferrer"
                className="viewer-btn"
                title="Download full-resolution capture"
              >
                <Download size={14} />
                <span>RAW</span>
              </a>
            )}

            <button type="button" className="viewer-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Center Canvas / Media */}
        <div className="viewer-canvas">
          {onPrev && (
            <button type="button" className="nav-arrow left" onClick={onPrev} title="Previous image">
              <ChevronLeft size={24} />
            </button>
          )}

          <div className="media-stage">
            <div 
              className="image-render-box"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {!loadError && activeUrl ? (
                <img 
                  src={activeUrl} 
                  alt={image.title || 'NocturPod Capture'} 
                  className="full-view-img"
                  onError={() => setLoadError(true)}
                />
              ) : (
                <div 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 20px',
                    color: 'var(--color-muted-sage)',
                    gap: '12px'
                  }}
                >
                  <ImageOff size={48} style={{ opacity: 0.6 }} />
                  <span className="mono" style={{ fontSize: '12px' }}>
                    {loadError ? 'IMAGE ACCESS SIGNATURE EXPIRED' : 'NO IMAGE AVAILABLE'}
                  </span>
                  <p className="mono" style={{ fontSize: '10px', opacity: 0.7, margin: 0 }}>
                    Please refresh the images list to regenerate signed storage tokens.
                  </p>
                </div>
              )}

              {/* Bounding boxes overlays */}
              {showBoxes && !loadError && image.boundingBoxes && image.boundingBoxes.map((rawBox, i) => {
                let x1 = rawBox.x1 ?? (rawBox.box ? rawBox.box[0] : 0);
                let y1 = rawBox.y1 ?? (rawBox.box ? rawBox.box[1] : 0);
                let x2 = rawBox.x2 ?? (rawBox.box ? rawBox.box[2] : 0);
                let y2 = rawBox.y2 ?? (rawBox.box ? rawBox.box[3] : 0);

                if (x1 > 100 || x2 > 100 || y1 > 100 || y2 > 100) {
                  x1 = (x1 / 1920) * 100;
                  x2 = (x2 / 1920) * 100;
                  y1 = (y1 / 1080) * 100;
                  y2 = (y2 / 1080) * 100;
                }

                const style = {
                  left: `${Math.max(0, Math.min(100, x1))}%`,
                  top: `${Math.max(0, Math.min(100, y1))}%`,
                  width: `${Math.max(0, Math.min(100, x2 - x1))}%`,
                  height: `${Math.max(0, Math.min(100, y2 - y1))}%`,
                };

                const confStr = rawBox.confidence != null 
                  ? (rawBox.confidence <= 1 ? (rawBox.confidence * 100).toFixed(1) : rawBox.confidence) + '%'
                  : '';

                return (
                  <div key={i} className="ai-bbox" style={style}>
                    <span className="ai-bbox-label mono">
                      {rawBox.label} {confStr}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {onNext && (
            <button type="button" className="nav-arrow right" onClick={onNext} title="Next image">
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Bottom Metadata Drawer */}
        <div className="viewer-footer">
          <div className="meta-cell">
            <span className="meta-label">TIMESTAMP</span>
            <span className="meta-value mono">{image.timestamp}</span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">SENSOR & RESOLUTION</span>
            <span className="meta-value mono">{image.resolution || '1280×720 / OV5647'}</span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">PIPELINE STATUS</span>
            <span className="meta-value mono">{image.enhancedUrl ? 'ENHANCED (CLAHE)' : (image.processingStatus || 'ORIGINAL')}</span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">AI CLASSIFICATION</span>
            <span className="meta-value tag-value mono">
              {image.aiTag || 'None'} {image.confidence ? `(${(image.confidence * 100).toFixed(1)}%)` : ''}
            </span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">EVENT IDENTIFIER</span>
            <span className="meta-value mono">{image.eventId || image.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
