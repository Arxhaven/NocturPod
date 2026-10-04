import React, { useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Cpu, 
  Sparkles, 
  Layers,
  Calendar,
  Clock,
  Crosshair
} from 'lucide-react';
import './ImageViewerModal.css';

export default function ImageViewerModal({ image, onClose, onPrev, onNext }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [claheSim, setClaheSim] = useState(true);

  if (!image) return null;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.3, 2.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.3, 0.7));

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="viewer-header">
          <div className="viewer-title-group">
            <span className="viewer-id mono">{image.id}</span>
            <h2 className="viewer-title">{image.title || 'Edge Capture'}</h2>
          </div>

          <div className="viewer-actions">
            <button 
              className={`viewer-btn ${showBoxes ? 'active' : ''}`}
              onClick={() => setShowBoxes(!showBoxes)}
              title="Toggle AI Detection Bounding Boxes"
            >
              <Crosshair size={14} />
              <span className="mono">BOUNDING BOXES</span>
            </button>

            <button 
              className={`viewer-btn ${claheSim ? 'active' : ''}`}
              onClick={() => setClaheSim(!claheSim)}
              title="Toggle CLAHE Low-Light Enhancement"
            >
              <Sparkles size={14} />
              <span className="mono">CLAHE</span>
            </button>

            <div className="viewer-btn-group">
              <button className="viewer-btn icon" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut size={15} />
              </button>
              <span className="zoom-indicator mono">{(zoomLevel * 100).toFixed(0)}%</span>
              <button className="viewer-btn icon" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn size={15} />
              </button>
            </div>

            <a 
              href={image.url} 
              download={`nocturpod-${image.id}.jpg`} 
              target="_blank" 
              rel="noreferrer"
              className="viewer-btn"
              title="Download full-resolution capture"
            >
              <Download size={14} />
              <span>RAW</span>
            </a>

            <button className="viewer-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Center Canvas / Media */}
        <div className="viewer-canvas">
          {onPrev && (
            <button className="nav-arrow left" onClick={onPrev} title="Previous image">
              <ChevronLeft size={24} />
            </button>
          )}

          <div className="media-stage">
            <div 
              className="image-render-box"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <img 
                src={image.url} 
                alt={image.title} 
                className={`full-view-img ${claheSim ? 'clahe-active' : ''}`} 
              />

              {/* Bounding boxes overlays */}
              {showBoxes && image.boundingBoxes && image.boundingBoxes.map((box, i) => (
                <div 
                  key={i}
                  className="ai-bbox"
                  style={{
                    left: `${box.x1}%`,
                    top: `${box.y1}%`,
                    width: `${box.x2 - box.x1}%`,
                    height: `${box.y2 - box.y1}%`,
                  }}
                >
                  <span className="ai-bbox-label mono">
                    {box.label} {(box.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {onNext && (
            <button className="nav-arrow right" onClick={onNext} title="Next image">
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
            <span className="meta-value mono">{image.resolution || '1920×1080'} / OV5647</span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">EXPOSURE & GAIN</span>
            <span className="meta-value mono">{image.iso || 'ISO 1600'} • {image.shutter || '1/40s'}</span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">AI CLASSIFICATION</span>
            <span className="meta-value tag-value mono">
              {image.aiTag || 'None'} ({image.confidence ? (image.confidence * 100).toFixed(1) + '%' : 'N/A'})
            </span>
          </div>

          <div className="meta-cell">
            <span className="meta-label">EVENT LINK</span>
            <span className="meta-value mono">{image.eventId || 'Manual Snap'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
