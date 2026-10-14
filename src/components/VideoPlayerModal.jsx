import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Sparkles, 
  Film,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { resolveMediaUrl } from '../services/api';
import './VideoPlayerModal.css';

export default function VideoPlayerModal({ video, onClose, onDelete }) {
  const [viewMode, setViewMode] = useState('ENHANCED'); // 'ENHANCED' or 'ORIGINAL'
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!video) return null;

  const rawOriginalUrl = video.original_url || video.videoUrl;
  const rawEnhancedUrl = video.enhanced_url;
  const originalUrl = resolveMediaUrl(rawOriginalUrl);
  const enhancedUrl = resolveMediaUrl(rawEnhancedUrl);
  const isEnhancedReady = video.processing_status === 'COMPLETE' && enhancedUrl;
  const isEnhancing = video.processing_status === 'PROCESSING' || video.processing_status === 'PENDING';

  const activeDisplayUrl = viewMode === 'ENHANCED' && isEnhancedReady ? enhancedUrl : originalUrl;

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal-header">
          <div className="v-title-group">
            <span className="v-id mono">{video.event_id || video.id}</span>
            <div className="v-status-indicator">
              {isEnhancedReady ? (
                <span className="tag-complete mono"><CheckCircle2 size={13} /> ENHANCED</span>
              ) : isEnhancing ? (
                <span className="tag-processing mono"><Clock size={13} /> ENHANCING...</span>
              ) : (
                <span className="tag-original mono">ORIGINAL ONLY</span>
              )}
            </div>
          </div>

          <div className="v-actions">
            {/* Toggle Between Original and Enhanced */}
            <div className="mode-toggle-group">
              <button 
                className={`mode-toggle-btn mono ${viewMode === 'ORIGINAL' ? 'active' : ''}`}
                onClick={() => setViewMode('ORIGINAL')}
              >
                <Film size={14} />
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

            {/* Download Original */}
            {originalUrl && (
              <a 
                href={originalUrl} 
                download={`nocturpod-${video.event_id || video.id}-original.mp4`} 
                className="v-btn mono"
                title="Download original recorded clip"
              >
                <Download size={14} />
                <span>ORIGINAL</span>
              </a>
            )}

            {enhancedUrl && isEnhancedReady && (
              <a 
                href={enhancedUrl} 
                download={`nocturpod-${video.event_id || video.id}-enhanced.mp4`} 
                className="v-btn highlight mono"
                title="Download AI enhanced video clip"
              >
                <Download size={14} />
                <span>ENHANCED</span>
              </a>
            )}

            {/* Delete Button */}
            {onDelete && (
              <button
                className={`v-btn delete-btn mono ${confirmDelete ? 'confirm' : ''}`}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                  } else {
                    onDelete(video.event_id || video.id);
                  }
                }}
                title={confirmDelete ? "Click again to permanently delete" : "Delete recording"}
              >
                <Trash2 size={14} />
                <span>{confirmDelete ? "CONFIRM DELETE?" : "DELETE"}</span>
              </button>
            )}

            <button className="v-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="video-stage">
          {activeDisplayUrl ? (
            <video 
              key={activeDisplayUrl}
              src={activeDisplayUrl} 
              controls 
              autoPlay 
              playsInline
              className="footage-video-el"
            />
          ) : (
            <div className="no-media-box mono">
              <AlertCircle size={28} />
              <span>VIDEO CURRENTLY UNAVAILABLE</span>
            </div>
          )}
        </div>

        <div className="video-modal-footer">
          <div className="v-meta-cell">
            <span className="v-meta-label mono">EVENT ID</span>
            <span className="v-meta-value mono">{video.event_id || video.id}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label mono">ACTIVE VIEW</span>
            <span className="v-meta-value mono active">{viewMode}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label mono">DURATION</span>
            <span className="v-meta-value mono">{video.duration || 'N/A'}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label mono">ENHANCEMENT STATUS</span>
            <span className="v-meta-value mono">{video.processing_status || 'PENDING'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
