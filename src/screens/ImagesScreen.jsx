import React, { useState } from 'react';
import { 
  Search, 
  Maximize2,
  Image as ImageIcon,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { resolveMediaUrl } from '../services/api';
import './ImagesScreen.css';

export default function ImagesScreen({ images = [], onSelectImage }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = images.filter((img) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const eventId = (img.event_id || img.id || '').toLowerCase();
      const notes = (img.notes || '').toLowerCase();
      return eventId.includes(q) || notes.includes(q);
    }
    return true;
  });

  return (
    <div className="images-screen-container">
      {/* Top Search Bar */}
      <div className="images-filter-bar glass-panel">
        <div className="img-chips">
          <span className="chips-title mono">GENUINE CAPTURES: {images.length}</span>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            className="search-input mono"
            placeholder="Search captures by Event ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of captures */}
      {filtered.length === 0 ? (
        <div className="empty-state-panel glass-panel">
          <ImageIcon size={40} className="empty-icon" />
          <h3 className="empty-title">NO CAPTURES YET</h3>
          <p className="empty-sub mono">
            Trigger a manual capture from the Live Monitor to generate genuine OV5647 stills.
          </p>
        </div>
      ) : (
        <div className="images-masonry-grid">
          {filtered.map((item) => {
            const isEnhanced = item.processing_status === 'COMPLETE' && item.enhanced_url;
            const isProcessing = item.processing_status === 'PROCESSING' || item.processing_status === 'PENDING';
            const rawDisplayUrl = isEnhanced ? item.enhanced_url : (item.original_url || item.thumbnail);
            const displayUrl = resolveMediaUrl(rawDisplayUrl);

            return (
              <div 
                key={item.event_id || item.id} 
                className="image-card glass-panel"
                onClick={() => onSelectImage(item)}
                role="button"
                tabIndex={0}
              >
                <div className="img-preview-box">
                  {displayUrl ? (
                    <img src={displayUrl} alt={item.event_id || 'Capture'} loading="lazy" />
                  ) : (
                    <div className="placeholder-preview mono">
                      <Clock size={24} />
                      <span>PROCESSING</span>
                    </div>
                  )}

                  <div className="img-hover-actions">
                    <span className="expand-pill mono">
                      <Maximize2 size={13} />
                      <span>INSPECT STILL</span>
                    </span>
                  </div>

                  <div className="img-overlay-top">
                    {isEnhanced ? (
                      <span className="ai-status-pill complete mono">
                        <CheckCircle2 size={11} />
                        <span>AI ENHANCED</span>
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

                <div className="img-meta-footer">
                  <span className="img-event-id mono">{item.event_id || item.id}</span>
                  <span className="img-time mono">
                    {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
