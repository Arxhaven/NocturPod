import React, { useState } from 'react';
import { 
  Play, 
  Film, 
  Search, 
  Clock, 
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import './FootageScreen.css';

export default function FootageScreen({ footageList = [], onSelectVideo }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = footageList.filter((item) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const eventId = (item.event_id || item.id || '').toLowerCase();
      const notes = (item.notes || '').toLowerCase();
      return eventId.includes(q) || notes.includes(q);
    }
    return true;
  });

  return (
    <div className="footage-screen-container">
      {/* Top Search Bar */}
      <div className="footage-filter-bar glass-panel">
        <div className="filter-chips">
          <span className="chips-title mono">TOTAL RECORDINGS: {footageList.length}</span>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            className="search-input mono"
            placeholder="Search recordings by Event ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of recorded clips */}
      {filtered.length === 0 ? (
        <div className="empty-state-panel glass-panel">
          <Film size={40} className="empty-icon" />
          <h3 className="empty-title">NO RECORDINGS YET</h3>
          <p className="empty-sub mono">
            Use 'Start Recording' and 'Stop Recording' in the Live Monitor to capture video clips.
          </p>
        </div>
      ) : (
        <div className="footage-grid">
          {filtered.map((clip) => {
            const isEnhanced = clip.processing_status === 'COMPLETE' && clip.enhanced_url;
            const isProcessing = clip.processing_status === 'PROCESSING' || clip.processing_status === 'PENDING';

            return (
              <div 
                key={clip.event_id || clip.id} 
                className="footage-card glass-panel"
                onClick={() => onSelectVideo(clip)}
                role="button"
                tabIndex={0}
              >
                <div className="footage-thumb-container">
                  <div className="footage-video-poster">
                    <Film size={36} className="poster-film-icon" />
                  </div>
                  <div className="play-overlay">
                    <div className="play-circle">
                      <Play size={18} fill="currentColor" />
                    </div>
                  </div>
                  <span className="duration-tag mono">{clip.duration || 'Video'}</span>

                  <div className="footage-overlay-top">
                    {isEnhanced ? (
                      <span className="ai-status-pill complete mono">
                        <CheckCircle2 size={11} />
                        <span>ENHANCED</span>
                      </span>
                    ) : isProcessing ? (
                      <span className="ai-status-pill processing mono">
                        <Clock size={11} />
                        <span>ENHANCING...</span>
                      </span>
                    ) : (
                      <span className="ai-status-pill original mono">
                        <span>ORIGINAL</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="footage-info">
                  <div className="footage-title-row">
                    <h3 className="footage-title mono">{clip.event_id || clip.id}</h3>
                  </div>

                  <div className="footage-meta-row mono">
                    <span>{clip.timestamp ? new Date(clip.timestamp).toLocaleDateString() : 'Recent'}</span>
                    <span className="dot-divider">•</span>
                    <span className="active-tag">{isEnhanced ? 'ORIGINAL + ENHANCED' : 'ORIGINAL'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
