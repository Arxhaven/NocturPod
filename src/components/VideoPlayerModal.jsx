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
import { buildApiUrl, resolveMediaUrl } from '../services/api';
import './VideoPlayerModal.css';

export default function VideoPlayerModal({ video, onClose, onDelete }) {
  const [viewMode, setViewMode] = useState('ENHANCED'); // 'ENHANCED' or 'ORIGINAL'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failedUrls, setFailedUrls] = useState({});

  if (!video) return null;

  const eventId = video.event_id || video.id;
  const rawOriginalUrl = video.original_url || video.videoUrl;
  const rawEnhancedUrl = video.enhanced_url;
  const originalUrl = resolveMediaUrl(rawOriginalUrl);
  const enhancedUrl = resolveMediaUrl(rawEnhancedUrl);
  const isEnhancedReady = Boolean(enhancedUrl);
  const isEnhancing = video.processing_status === 'PROCESSING' || video.processing_status === 'PENDING';
  const quality = video.quality_metrics;
  const qualityBefore = quality?.before?.visibility_index;
  const qualityAfter = quality?.after?.visibility_index;
  const qualityChange = quality?.relative_change_pct;

  // Stream through the backend, which returns a range-capable H.264 MP4 URL.
  // Older mp4v captures get a separate browser-playback copy; stored originals
  // and enhanced assets remain available unchanged for downloads.
  const originalStreamUrl = eventId
    ? buildApiUrl(`/api/media/stream/${encodeURIComponent(eventId)}/original`)
    : originalUrl;
  const enhancedStreamUrl = eventId
    ? buildApiUrl(`/api/media/stream/${encodeURIComponent(eventId)}/enhanced`)
    : enhancedUrl;
  const originalDownloadUrl = eventId
    ? buildApiUrl(`/api/media/download/${encodeURIComponent(eventId)}/original`)
    : originalUrl;
  const enhancedDownloadUrl = eventId
    ? buildApiUrl(`/api/media/download/${encodeURIComponent(eventId)}/enhanced`)
    : enhancedUrl;

  const activeDisplayUrl = viewMode === 'ENHANCED' && isEnhancedReady
    ? enhancedStreamUrl
    : originalStreamUrl;

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal-header">
          <div className="v-title-group">
            <span className="v-id mono">{eventId}</span>
            <div className="v-status-indicator">
              {video.status === 'ENHANCEMENT_FAILED' ? (
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
                href={originalDownloadUrl} 
                download={`nocturpod-${eventId}-original.mp4`} 
                className="v-btn mono"
                title="Download original recorded clip"
              >
                <Download size={14} />
                <span>ORIGINAL</span>
              </a>
            )}

            {enhancedUrl && (
              <a 
                href={enhancedDownloadUrl} 
                download={`nocturpod-${eventId}-enhanced.mp4`} 
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
          {activeDisplayUrl && !failedUrls[activeDisplayUrl] ? (
            <video
              key={activeDisplayUrl}
              src={activeDisplayUrl}
              controls
              autoPlay
              playsInline
              className="footage-video-el"
              onError={() => setFailedUrls((previous) => ({ ...previous, [activeDisplayUrl]: true }))}
            />
          ) : (
            <div className="no-media-box mono">
              <AlertCircle size={28} />
              <span>VIDEO CURRENTLY UNAVAILABLE</span>
              <span className="mono">Playback could not be opened. Check the network and storage links; the download actions above may still work.</span>
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
          {qualityBefore != null && qualityAfter != null && (
            <>
              <div className="v-meta-cell" title={quality?.explanation || 'Heuristic image-quality indicator, not AI accuracy.'}>
                <span className="v-meta-label mono">VISIBILITY INDEX*</span>
                <span className="v-meta-value mono">{qualityBefore.toFixed(1)} → {qualityAfter.toFixed(1)} / 100</span>
              </div>
              <div className="v-meta-cell" title="Relative change in a heuristic visibility index, not a percentage of detection accuracy.">
                <span className="v-meta-label mono">RELATIVE CHANGE*</span>
                <span className="v-meta-value mono">{qualityChange > 0 ? '+' : ''}{qualityChange?.toFixed(1)}%</span>
              </div>
            </>
          )}
          {quality?.ir_color_cast_detected && (
            <div className="v-meta-cell" title="Frames with strong red/purple IR colour cast are normalized to grayscale in the enhanced copy; the original recording is unchanged.">
              <span className="v-meta-label mono">IR CAST SAMPLES</span>
              <span className="v-meta-value mono">
                {quality.ir_cast_sample_pct != null ? quality.ir_cast_sample_pct.toFixed(1) + '% → GRAYSCALE' : 'NORMALIZED → GRAYSCALE'}
              </span>
            </div>
          )}
          {quality?.resolution_before && quality?.resolution_after && (
            <div className="v-meta-cell" title={quality?.upscaler || 'Learned super-resolution output resolution'}>
              <span className="v-meta-label mono">SOURCE → OUTPUT</span>
              <span className="v-meta-value mono">{quality.resolution_before} → {quality.resolution_after}</span>
            </div>
          )}
          {quality?.upscaler && (
            <div className="v-meta-cell" title={quality?.explanation || 'Learned super-resolution model'}>
              <span className="v-meta-label mono">RESTORATION MODEL</span>
              <span className="v-meta-value mono">{quality.upscaler}</span>
            </div>
          )}
        </div>
        {qualityBefore != null && (
          <div className="quality-disclaimer mono">*Heuristic quality score sampled from video frames; not a person-recognition accuracy percentage.</div>
        )}
      </div>
    </div>
  );
}
