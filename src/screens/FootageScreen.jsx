import React, { useState } from 'react';
import { 
  Play, 
  Film, 
  Search, 
  Video,
  Download,
  Filter,
  Eye,
  RefreshCw
} from 'lucide-react';
import { safeFootageFilter, formatFootageAi } from '../utils/footageSearch';
import './FootageScreen.css';

export default function FootageScreen({ 
  footageList = [], 
  onSelectVideo,
  onRefreshFootage,
  isRefreshing = false
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');

  const filtered = safeFootageFilter(footageList, selectedTag, searchQuery);

  return (
    <div className="footage-screen-container">
      {/* Top Filter and Search Bar */}
      <div className="footage-filter-bar glass-panel">
        <div className="filter-chips">
          <button 
            type="button"
            className={`f-chip mono ${selectedTag === 'ALL' ? 'active' : ''}`}
            onClick={() => setSelectedTag('ALL')}
          >
            ALL CLIPS ({footageList.length})
          </button>
          <button 
            type="button"
            className={`f-chip mono ${selectedTag === 'Person' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Person')}
          >
            PERSON
          </button>
          <button 
            type="button"
            className={`f-chip mono ${selectedTag === 'Vehicle' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Vehicle')}
          >
            VEHICLE
          </button>
          <button 
            type="button"
            className={`f-chip mono ${selectedTag === 'Animal' ? 'active' : ''}`}
            onClick={() => setSelectedTag('Animal')}
          >
            ANIMAL / OTHER
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onRefreshFootage && (
            <button
              type="button"
              className="f-chip mono"
              onClick={onRefreshFootage}
              disabled={isRefreshing}
              title="Refresh footage from backend"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <RefreshCw size={12} className={isRefreshing ? 'spin-icon' : ''} />
              <span>{isRefreshing ? 'REFRESHING...' : 'REFRESH'}</span>
            </button>
          )}

          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              className="search-input mono" 
              placeholder="Search clips by sector, time, tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grid of recorded clips */}
      {filtered.length === 0 ? (
        <div className="empty-footage-state glass-panel mono" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted-sage)' }}>
          <Film size={32} style={{ margin: '0 auto 12px', opacity: 0.6, display: 'block' }} />
          <span>NO FOOTAGE CLIPS MATCH CURRENT CRITERIA</span>
        </div>
      ) : (
        <div className="footage-grid">
          {filtered.map((clip) => {
            const aiInfo = formatFootageAi(clip);
            const resText = clip.resolution ? clip.resolution.split(' ')[0] : '1080p';

            return (
              <div 
                key={clip.id} 
                className="footage-card glass-panel"
                onClick={() => onSelectVideo && onSelectVideo(clip)}
                role="button"
                tabIndex={0}
              >
                <div className="footage-thumb-container">
                  {clip.thumbnail ? (
                    <img 
                      src={clip.thumbnail} 
                      alt={clip.title || 'Footage thumbnail'} 
                      loading="lazy"
                      onError={(e) => {
                        // Hide broken image and reveal container background
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div 
                      className="footage-thumb-placeholder" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: 'var(--color-muted-sage)', 
                        gap: '8px',
                        background: 'linear-gradient(135deg, rgba(11, 43, 38, 0.6) 0%, rgba(5, 31, 32, 0.9) 100%)' 
                      }}
                    >
                      <Video size={30} style={{ opacity: 0.7 }} />
                      <span className="mono" style={{ fontSize: '11px', opacity: 0.7 }}>LOCAL H.264 RECORDING</span>
                    </div>
                  )}

                  <div className="play-overlay">
                    <div className="play-circle">
                      <Play size={18} fill="currentColor" />
                    </div>
                  </div>
                  <span className="duration-tag mono">{clip.duration || '00:30'}</span>
                  <span className="res-tag mono">{resText}</span>
                </div>

                <div className="footage-info">
                  <div className="footage-title-row">
                    <h3 className="footage-title">{clip.title || `Clip ${clip.id}`}</h3>
                    <span className={`footage-ai-pill mono ${aiInfo.hasTag ? '' : 'unclassified'}`}>
                      {aiInfo.tagText}
                    </span>
                  </div>

                  <div className="footage-meta-row mono">
                    <span>{clip.timestamp || 'Timestamp N/A'}</span>
                    <span>{clip.fileSize || 'Size N/A'}</span>
                  </div>

                  <div className="footage-hardware-row mono">
                    <span>CAM: {clip.camera || 'OV5647 IR-Cut'}</span>
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
