import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Download, 
  Film,
  Calendar,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import './VideoPlayerModal.css';

export default function VideoPlayerModal({ video, onClose }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  if (!video) return null;

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal-header">
          <div className="v-title-group">
            <span className="v-id mono">{video.id}</span>
            <h2 className="v-title">{video.title}</h2>
          </div>

          <div className="v-actions">
            <a 
              href={video.videoUrl} 
              download={`nocturpod-${video.id}.mp4`} 
              className="v-btn"
              title="Download recorded clip"
            >
              <Download size={14} />
              <span>EXPORT MP4</span>
            </a>

            <button className="v-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="video-stage">
          <video 
            src={video.videoUrl} 
            controls 
            autoPlay 
            playsInline
            className="footage-video-el"
          />
        </div>

        <div className="video-modal-footer">
          <div className="v-meta-cell">
            <span className="v-meta-label">TIMESTAMP</span>
            <span className="v-meta-value mono">{video.timestamp}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label">DURATION & FORMAT</span>
            <span className="v-meta-value mono">{video.duration} • {video.resolution}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label">CAMERA HARDWARE</span>
            <span className="v-meta-value mono">{video.camera}</span>
          </div>

          <div className="v-meta-cell">
            <span className="v-meta-label">AI DETECTIONS</span>
            <div className="v-tag-list">
              {video.detections?.map((d, i) => (
                <span key={i} className="v-ai-tag mono">{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
